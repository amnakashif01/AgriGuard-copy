import { z } from 'zod';
import { checkOrigin, signedInAccount, ownerFailure, OwnerError } from '@/lib/server/owner-auth';
import { ownerIdSchema } from '@/lib/owner-admin';
import { ownerRecords } from '@/lib/server/owner-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : '';
const text = (max: number) => z.string().trim().max(max);
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('profile.share'), name: text(80).min(1), city: text(80) }).strict(),
  z.object({ action: z.literal('profile.hide') }).strict(),
  z.object({ action: z.literal('case.share'), reportId: ownerIdSchema, usedTreatment: text(500), progress: z.enum(['Not started', 'Treatment ongoing', 'Improved', 'Resolved']) }).strict(),
  z.object({ action: z.literal('case.hide'), reportId: ownerIdSchema }).strict(),
]);
export async function GET(request: Request) {
  try {
    checkOrigin(request);
    const services = await signedInAccount(request);
    const { db, token } = services;
    const params = new URL(request.url).searchParams;
    if (params.get('resource') === 'mine') {
      const cursor = params.get('cursor') || undefined;
      if (cursor && !ownerIdSchema.safeParse(cursor).success) throw new OwnerError('Invalid report cursor.');
      const [profile, reports, cases] = await Promise.all([db.doc(`community_profiles/${token.uid}`).get(), ownerRecords(services, token.uid, 'reports', cursor), db.collection(`community_profiles/${token.uid}/cases`).get()]);
      return Response.json({ profile: profile.exists ? profile.data() : null, reports: reports.reports, hasMore: reports.hasMore, cases: cases.docs.map(doc => ({ id: doc.id, ...doc.data() })) }, { headers });
    }
    const uid = params.get('uid');
    if (uid) {
      if (!ownerIdSchema.safeParse(uid).success) throw new OwnerError('Invalid profile.');
      const profile = await db.doc(`community_profiles/${uid}`).get();
      const control = await db.doc(`account_controls/${uid}`).get();
      if (!profile.exists || control.data()?.disabled) throw new OwnerError('This community profile is unavailable.', 404);
      const cases = await db.collection(`community_profiles/${uid}/cases`).orderBy('updatedAt', 'desc').get();
      const sources = cases.size ? await db.getAll(...cases.docs.map(doc => db.doc(`users/${uid}/reports/${doc.id}`))) : [];
      return Response.json({ profile: { uid, ...profile.data() }, cases: cases.docs.filter((doc,index) => sources[index].exists).map(doc => ({ id: doc.id, ...doc.data() })) }, { headers });
    }
    const [profiles, controls] = await Promise.all([db.collection('community_profiles').get(), db.collection('account_controls').where('disabled', '==', true).get()]);
    const unavailable = new Set(controls.docs.map(doc => doc.id));
    const search = (params.get('search') || '').slice(0, 80).toLowerCase();
    const farmers = profiles.docs.filter(doc => !unavailable.has(doc.id)).map(doc => ({ uid: doc.id, ...doc.data() })).filter((profile: any) => !search || `${profile.name} ${profile.city}`.toLowerCase().includes(search)).sort((a: any,b: any) => a.name.localeCompare(b.name));
    return Response.json({ farmers }, { headers });
  } catch (error) { return ownerFailure(error); }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { db, token } = await signedInAccount(request);
    const raw = await request.text();
    if (raw.length > 4000) throw new OwnerError('Request is too large.', 413);
    let input: unknown;
    try { input = JSON.parse(raw); } catch { throw new OwnerError('Invalid request.'); }
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new OwnerError('Check the supplied fields.');
    const action = parsed.data;
    // The authenticated UID is the only permitted write target. Never accept one from the client.
    const profileRef = db.doc(`community_profiles/${token.uid}`);
    const now = new Date().toISOString();
    if (action.action === 'profile.share') {
      await profileRef.set({ name: action.name, city: action.city, updatedAt: now });
    } else if (action.action === 'profile.hide') {
      await profileRef.delete(); // Block new shares before removing child projections.
      const writer = db.bulkWriter();
      try { await db.recursiveDelete(profileRef, writer); } finally { await writer.close(); }
    } else if (action.action === 'case.hide') {
      await profileRef.collection('cases').doc(action.reportId).delete();
    } else {
      await db.runTransaction(async transaction => {
        const [profile, report] = await Promise.all([transaction.get(profileRef), transaction.get(db.doc(`users/${token.uid}/reports/${action.reportId}`))]);
        if (!profile.exists) throw new OwnerError('Share your limited profile before adding a case.');
        if (!report.exists) throw new OwnerError('Your report was not found.', 404);
        const data = report.data()!;
        if (data.status !== 'Complete') throw new OwnerError('Only completed reports can be shared.');
        const steps = Array.isArray(data.plan?.steps) ? data.plan.steps.slice(0, 12).map((step: any) => ({ title: clean(step?.title, 120), description: clean(step?.description, 1000) })) : [];
        // Deliberate projection: no email, phone, coordinates, photo, private notes or raw history.
        transaction.set(profileRef.collection('cases').doc(action.reportId), { crop: clean(data.crop, 80), disease: clean(data.disease, 150), carePlan: steps, usedTreatment: action.usedTreatment, progress: action.progress, updatedAt: now });
      });
    }
    return Response.json({ success: true }, { headers });
  } catch (error) { return ownerFailure(error); }
}
