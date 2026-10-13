import type { UserRecord } from 'firebase-admin/auth';
import type { DocumentSnapshot, DocumentReference, CollectionReference, Firestore, Query } from 'firebase-admin/firestore';
import { adminServices, OwnerError } from './owner-auth';
import { isRecentlyActive, OWNER_EMAIL, type Farmer, type FarmerDetail, type OwnerAction, type OwnerAudit, type OwnerOverview } from '../owner-admin';

type Services = ReturnType<typeof adminServices>;
function iso(value: unknown): string | null {
  if (!value) return null;
  if (typeof (value as { toDate?: unknown }).toDate === 'function') return (value as { toDate(): Date }).toDate().toISOString();
  const time = new Date(value as string).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}
function text(value: unknown) { return typeof value === 'string' ? value : ''; }
function version(snapshot: DocumentSnapshot) { return snapshot.updateTime?.toDate().getTime() + ':' + snapshot.updateTime?.nanoseconds; }
function checkVersion(snapshot: DocumentSnapshot, expected: string) {
  if (!snapshot.exists) throw new OwnerError('This record no longer exists.', 404);
  if (version(snapshot) !== expected) throw new OwnerError('This record changed. Refresh it before saving or deleting.', 409);
}
async function mapLimited<T, R>(items: T[], run: (item: T) => Promise<R>): Promise<R[]> {
  const result: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, items.length) }, async () => {
    while (next < items.length) { const index = next++; result[index] = await run(items[index]); }
  }));
  return result;
}
async function farmerSummary(services: Services, account: UserRecord, profile?: DocumentSnapshot, presence?: DocumentSnapshot): Promise<Farmer> {
  const { db } = services;
  const [p, seen, crops, reports] = await Promise.all([
    profile || db.doc(`profiles/${account.uid}`).get(), presence || db.doc(`account_presence/${account.uid}`).get(),
    db.collection(`users/${account.uid}/crops`).count().get(), db.collection(`users/${account.uid}/reports`).count().get(),
  ]);
  const lastSeenAt = iso(seen.data()?.lastSeenAt);
  return { uid: account.uid, name: text(p.data()?.name) || account.displayName || account.email?.split('@')[0] || 'Farmer', email: account.email || '', phone: account.phoneNumber || '', location: text(p.data()?.location), createdAt: iso(account.metadata.creationTime), lastSignInAt: iso(account.metadata.lastSignInTime), lastSeenAt, online: !account.disabled && isRecentlyActive(lastSeenAt), disabled: account.disabled, protected: account.email?.toLowerCase() === OWNER_EMAIL || account.customClaims?.owner === true, cropCount: crops.data().count, reportCount: reports.data().count };
}
function auditRow(doc: DocumentSnapshot): OwnerAudit {
  const data = doc.data() || {};
  return { id: doc.id, action: text(data.action), targetName: text(data.targetName), targetUid: text(data.targetUid), resourceName: text(data.resourceName), status: text(data.status), createdAt: iso(data.createdAt) || '' };
}
export async function ownerOverview(services: Services, search: string, page: number, filter: string): Promise<OwnerOverview> {
  const accounts: UserRecord[] = [];
  let nextPage: string | undefined;
  do { const result = await services.auth.listUsers(1000, nextPage); accounts.push(...result.users); nextPage = result.pageToken; } while (nextPage);
  const [profiles, presence, crops, reports, audit] = await Promise.all([
    services.db.collection('profiles').select('name', 'location').get(), services.db.collection('account_presence').get(),
    services.db.collectionGroup('crops').count().get(), services.db.collectionGroup('reports').count().get(),
    services.db.collection('owner_audit').orderBy('createdAt', 'desc').limit(12).get(),
  ]);
  const profileMap = new Map(profiles.docs.map(doc => [doc.id, doc]));
  const presenceMap = new Map(presence.docs.map(doc => [doc.id, doc]));
  const needle = search.trim().toLowerCase();
  const filtered = accounts.filter(account => {
    const profile = profileMap.get(account.uid)?.data();
    return (filter !== 'active' || !account.disabled) && (filter !== 'suspended' || account.disabled) && (!needle || [account.email, account.phoneNumber, account.displayName, profile?.name, profile?.location].some(value => text(value).toLowerCase().includes(needle)));
  }).sort((a, b) => Date.parse(b.metadata.creationTime) - Date.parse(a.metadata.creationTime));
  const pageSize = 10;
  const actualPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const farmers = await mapLimited(filtered.slice((actualPage - 1) * pageSize, actualPage * pageSize), account => farmerSummary(services, account, profileMap.get(account.uid), presenceMap.get(account.uid)));
  return { farmers, total: filtered.length, page: actualPage, pageSize, stats: { farmers: accounts.length, online: accounts.filter(account => !account.disabled && isRecentlyActive(iso(presenceMap.get(account.uid)?.data()?.lastSeenAt))).length, crops: crops.data().count, reports: reports.data().count }, activity: audit.docs.map(auditRow) };
}
export async function ownerRecords(services: Services, uid: string, resource: 'crops' | 'reports', cursor?: string) {
  const collection = services.db.collection(`users/${uid}/${resource}`);
  let query: Query = collection.orderBy('createdAt', 'desc');
  if (cursor) {
    const last = await collection.doc(cursor).get();
    if (!last.exists) throw new OwnerError('This list changed. Refresh the farmer record.', 409);
    query = query.startAfter(last);
  }
  if (resource === 'reports') query = query.select('crop', 'disease', 'severity', 'status', 'createdAt', 'plantName');
  const page = await query.limit(101).get();
  const docs = page.docs.slice(0, 100);
  return {
    crops: resource === 'crops' ? docs.map(doc => { const d = doc.data(); return { id: doc.id, name: text(d.name), notes: text(d.notes), plantCount: Number(d.plantCount) || 0, createdAt: iso(d.createdAt), updatedAt: iso(d.updatedAt), version: version(doc), deleting: Boolean(d.deletingAt) }; }) : [],
    reports: resource === 'reports' ? docs.map(doc => { const d = doc.data(); return { id: doc.id, crop: text(d.crop), disease: text(d.disease), severity: text(d.severity), status: text(d.status), createdAt: iso(d.createdAt), plantName: text(d.plantName) }; }) : [],
    hasMore: page.size > 100,
  };
}
export async function farmerDetail(services: Services, uid: string): Promise<FarmerDetail> {
  let account: UserRecord;
  try { account = await services.auth.getUser(uid); } catch { throw new OwnerError('Farmer account not found.', 404); }
  const [profile, crops, reports, audit] = await Promise.all([
    services.db.doc(`profiles/${uid}`).get(), ownerRecords(services, uid, 'crops'), ownerRecords(services, uid, 'reports'),
    services.db.collection('owner_audit').where('targetUid', '==', uid).get(),
  ]);
  return { farmer: await farmerSummary(services, account, profile), profileVersion: profile.exists ? version(profile) : 'missing',
    crops: crops.crops, reports: reports.reports,
    activity: audit.docs.map(auditRow).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,50), hasMoreCrops: crops.hasMore, hasMoreReports: reports.hasMore };
}
export async function ownerReport(services: Services, uid: string, reportId: string) {
  const report = await services.db.doc(`users/${uid}/reports/${reportId}`).get();
  if (!report.exists) throw new OwnerError('Report not found.', 404);
  const data = report.data()!;
  // Return the saved diagnosis, plan and change history, without the large inference image.
  return { id: report.id, crop: text(data.crop), disease: text(data.disease), description: text(data.description), severity: text(data.severity), status: text(data.status), image: text(data.imageThumb) || text(data.imageUrl), createdAt: iso(data.createdAt), symptoms: text(data.symptoms), plantName: text(data.plantName), plan: data.plan || null, history: Array.isArray(data.history) ? data.history : [] };
}
async function deleteTree(db: Firestore, reference: DocumentReference | CollectionReference) {
  const writer = db.bulkWriter();
  try { await db.recursiveDelete(reference, writer); }
  finally { await writer.close(); }
}
async function deleteQuery(db: Firestore, query: Query) {
  while (true) {
    const page = await query.limit(100).get();
    if (page.empty) return;
    const batch = db.batch(); page.docs.forEach(doc => batch.delete(doc.ref)); await batch.commit();
  }
}
async function deleteOwnerCrop(services: Services, action: Extract<OwnerAction, { action: 'crop.delete' }>) {
  const { db } = services;
  const cropRef = db.doc(`users/${action.uid}/crops/${action.cropId}`);
  await db.runTransaction(async transaction => {
    const crop = await transaction.get(cropRef);
    checkVersion(crop, action.version);
    if (action.confirmation !== crop.data()?.name) throw new OwnerError('Enter the crop name to confirm deletion.');
    transaction.update(cropRef, { deletingAt: new Date().toISOString() });
  });
  // Keep the crop's deletion lock until all linked reports and descendants are gone.
  while (true) {
    const reports = await db.collection(`users/${action.uid}/reports`).where('cropId', '==', action.cropId).limit(100).get();
    if (reports.empty) break;
    const batch = db.batch();
    reports.docs.forEach(report => { batch.delete(report.ref); batch.delete(db.doc(`users/${action.uid}/notifications/diagnosis_${report.id}`)); });
    await batch.commit();
  }
  for (const collection of await cropRef.listCollections()) await deleteTree(db, collection);
  await cropRef.delete();
  const sharedCases = await db.collection(`community_profiles/${action.uid}/cases`).get();
  // Shared cases use report IDs. Drop projections whose private source was removed.
  for (const shared of sharedCases.docs) if (!(await db.doc(`users/${action.uid}/reports/${shared.id}`).get()).exists) await shared.ref.delete();
}
export async function ownerMutation(services: Services, actor: UserRecord, action: OwnerAction) {
  const { auth, db, storage } = services;
  let target: UserRecord;
  try { target = await auth.getUser(action.uid); } catch { throw new OwnerError('Farmer account not found.', 404); }
  const accountAction = action.action.startsWith('account.');
  if (accountAction && (target.uid === actor.uid || target.email?.toLowerCase() === OWNER_EMAIL || target.customClaims?.owner === true)) throw new OwnerError('The owner account is protected from suspension and deletion.', 403);
  const now = new Date().toISOString();
  const profile = await db.doc(`profiles/${action.uid}`).get();
  const targetName = text(profile.data()?.name) || target.displayName || target.email || 'Farmer';
  const audit = db.collection('owner_audit').doc();
  await audit.set({ actorUid: actor.uid, targetUid: target.uid, targetName, action: action.action, status: 'pending', createdAt: now, resourceName: 'cropId' in action ? action.cropId : '' });
  try {
    if (action.action === 'profile.update') {
      await db.runTransaction(async transaction => {
        const current = await transaction.get(profile.ref);
        if (action.version === 'missing' && current.exists) throw new OwnerError('This profile changed. Refresh it first.', 409);
        if (action.version !== 'missing') checkVersion(current, action.version);
        transaction.set(profile.ref, { uid: target.uid, phone: target.phoneNumber || '', email: target.email || '', name: action.name, location: action.location, updatedAt: now, ...(!current.exists ? { createdAt: iso(target.metadata.creationTime) || now } : {}) }, { merge: true });
      });
      await auth.updateUser(target.uid, { displayName: action.name });
    } else if (action.action === 'crop.update') {
      const ref = db.doc(`users/${action.uid}/crops/${action.cropId}`);
      await db.runTransaction(async transaction => {
        const [current, duplicates] = await Promise.all([transaction.get(ref), transaction.get(db.collection(`users/${action.uid}/crops`).where('nameKey', '==', action.name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ')))]);
        checkVersion(current, action.version);
        if (current.data()?.deletingAt) throw new OwnerError('This crop is being deleted.', 409);
        if (duplicates.docs.some(doc => doc.id !== action.cropId)) throw new OwnerError('A crop with this name already exists.', 409);
        transaction.update(ref, { name: action.name, nameKey: action.name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' '), notes: action.notes, updatedAt: now });
      });
    } else if (action.action === 'crop.delete') {
      await deleteOwnerCrop(services, action);
    } else if (action.action === 'account.suspend') {
      await db.doc(`account_controls/${target.uid}`).set({ disabled: true, status: 'suspended', updatedAt: now });
      await auth.updateUser(target.uid, { disabled: true });
      await auth.revokeRefreshTokens(target.uid);
    } else if (action.action === 'account.restore') {
      const control = await db.doc(`account_controls/${target.uid}`).get();
      if (control.data()?.status === 'deleting') throw new OwnerError('Deletion is in progress. Finish deletion before reusing this account.', 409);
      await auth.updateUser(target.uid, { disabled: false });
      await db.doc(`account_controls/${target.uid}`).set({ disabled: false, status: 'active', updatedAt: now });
    } else if (action.action === 'account.delete') {
      if (action.confirmation !== (target.email || target.phoneNumber || target.uid)) throw new OwnerError('Enter the account email or phone exactly to confirm deletion.');
      await db.doc(`account_controls/${target.uid}`).set({ disabled: true, status: 'deleting', updatedAt: now });
      await auth.updateUser(target.uid, { disabled: true });
      await auth.revokeRefreshTokens(target.uid);
      await deleteTree(db, db.doc(`users/${target.uid}`));
      await deleteTree(db, db.doc(`community_profiles/${target.uid}`));
      await Promise.all([
        deleteQuery(db, db.collection('marketplace').where('sellerId', '==', target.uid)),
        deleteQuery(db, db.collection('supplier_contacts').where('userId', '==', target.uid)),
        deleteQuery(db, db.collection('supplier_ratings').where('userId', '==', target.uid)),
      ]);
      if (!process.env.FIRESTORE_EMULATOR_HOST && process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) {
        try { await Promise.all([`reports/${target.uid}/`, `profiles/${target.uid}/`].map(prefix => storage.bucket().deleteFiles({ prefix }))); }
        catch (error) { if ((error as { code?: number }).code !== 404) throw error; }
      }
      await Promise.all([profile.ref.delete(), db.doc(`account_presence/${target.uid}`).delete()]);
      await auth.deleteUser(target.uid);
      await db.doc(`account_controls/${target.uid}`).set({ disabled: true, status: 'deleted', updatedAt: now });
    }
    await audit.update({ status: 'success', completedAt: new Date().toISOString() });
    return { success: true };
  } catch (error) {
    await audit.update({ status: 'failed', completedAt: new Date().toISOString() });
    throw error;
  }
}
