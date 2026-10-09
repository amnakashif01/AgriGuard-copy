import { collection, doc, getDocs, limit, orderBy, query, runTransaction, type Firestore } from 'firebase/firestore';
import { getDb } from '../firestore';

/** Remove one record, its report and completion alert atomically. Parent reads
 * serialize this with new analyses and crop deletion; late AI responses cannot
 * recreate the deleted documents. No plant or crop is removed. */
export async function deletePlantRecord(uid: string, cropId: string, plantId: string, reportId: string, db: Firestore = getDb()): Promise<void> {
  const cropRef = doc(db, 'users', uid, 'crops', cropId);
  const plantRef = doc(cropRef, 'plants', plantId);
  const recordRef = doc(plantRef, 'records', reportId);
  const reportRef = doc(db, 'users', uid, 'reports', reportId);
  for (let attempt = 0; attempt < 3; attempt++) {
    // Client transactions cannot query collections. Read the two latest records,
    // then validate both the parent pointer and replacement inside the transaction.
    const latest = await getDocs(query(collection(plantRef, 'records'), orderBy('createdAt', 'desc'), limit(2)));
    const replacementRef = latest.docs.find(item => item.id !== reportId)?.ref;
    const done = await runTransaction(db, async transaction => {
      const [crop, plant, record, report] = await Promise.all([
        transaction.get(cropRef), transaction.get(plantRef), transaction.get(recordRef), transaction.get(reportRef),
      ]);
      if (!record.exists() && !report.exists()) return true; // Safe repeated click.
      if (!crop.exists() || crop.data().deletingAt || !plant.exists()) throw new Error('This crop is being deleted or is no longer available.');
      if (report.exists() && (report.data().cropId !== cropId || report.data().plantId !== plantId || report.data().plantRecordId !== reportId)) throw new Error('This report does not belong to the selected plant.');
      if (record.exists() && (record.data().cropId !== cropId || record.data().plantId !== plantId || record.data().reportId !== reportId)) throw new Error('The record could not be verified.');
      const isLatest = plant.data().latestRecordId === reportId;
      if (isLatest && !latest.docs.some(item => item.id === reportId)) return false;
      if (!isLatest && replacementRef?.id !== plant.data().latestRecordId) return false;
      const replacement = replacementRef ? await transaction.get(replacementRef) : undefined;
      if (replacementRef && !replacement?.exists()) return false;
      const now = new Date().toISOString();
      transaction.delete(recordRef);
      transaction.delete(reportRef);
      transaction.delete(doc(db, 'users', uid, 'notifications', `diagnosis_${reportId}`));
      transaction.update(plantRef, {
        recordCount: Math.max(0, (Number(plant.data().recordCount) || 0) - (record.exists() ? 1 : 0)), updatedAt: now,
        imageThumb: replacement?.data()?.imageThumb || '',
        ...(isLatest ? {
          latestRecordId: replacement?.id || '',
          latestSeverityScore: replacement?.data()?.severityScore ?? null,
          latestDisease: replacement?.data()?.diagnosis?.disease || '',
          age: replacement?.data()?.age || plant.data().age,
        } : {}),
      });
      transaction.update(cropRef, { updatedAt: now });
      return true;
    });
    if (done) return;
  }
  throw new Error('The plant history changed while deleting. Please try again.');
}
