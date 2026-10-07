import { collection, doc, getDocs, limit, query, runTransaction, where, type DocumentReference, type Firestore, type Query } from 'firebase/firestore';
import { getDb } from '../firestore';
import type { MyCrop } from './models';

/** Delete only the selected crop generation. Every batch checks the parent lock,
 * so a retry or a second tab cannot remove a newly recreated crop with the same name.
 * Small batches also accommodate Firestore's request limit with stored photos. */
export async function deleteCrop(uid: string, crop: Pick<MyCrop, 'id' | 'createdAt'>, db: Firestore = getDb()) {
  const cropRef = doc(db, 'users', uid, 'crops', crop.id);
  const started = await runTransaction(db, async transaction => {
    const current = await transaction.get(cropRef);
    if (!current.exists() || current.data().createdAt !== crop.createdAt) return false;
    if (!current.data().deletingAt) transaction.update(cropRef, { deletingAt: new Date().toISOString() });
    return true;
  });
  if (!started) return;

  const remove = (refs: DocumentReference[]) => runTransaction(db, async transaction => {
    const current = await transaction.get(cropRef);
    if (!current.exists() || current.data().createdAt !== crop.createdAt || !current.data().deletingAt) return false;
    refs.forEach(ref => transaction.delete(ref));
    return true;
  });
  const removePages = async (source: Query, linkedReports = false) => {
    while (true) {
      const page = await getDocs(query(source, limit(10)));
      if (page.empty) return true;
      const refs = page.docs.flatMap(item => linkedReports
        ? [item.ref, doc(db, 'users', uid, 'notifications', `diagnosis_${item.id}`)]
        : [item.ref]);
      if (!await remove(refs)) return false;
    }
  };
  while (true) {
    const plants = await getDocs(query(collection(cropRef, 'plants'), limit(10)));
    if (plants.empty) break;
    for (const plant of plants.docs) {
      if (!await removePages(collection(plant.ref, 'records'))) return;
      if (!await remove([plant.ref])) return;
    }
  }
  if (!await removePages(query(collection(db, 'users', uid, 'reports'), where('cropId', '==', crop.id)), true)) return;
  await remove([cropRef]);
}
