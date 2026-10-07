import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where, terminate } from 'firebase/firestore';
import type { RecordAnalysis } from '../src/lib/my-crops/repository';

const photo = 'data:image/jpeg;base64,/9j/2Q==';
const input = { name: 'Plant A', age: '5 months', symptoms: 'Brown spots', imageThumb: photo, analysisImage: photo };
const analysis: RecordAnalysis = {
  severityScore: 70, severityExplanation: 'Visible spots cover much of the leaf.',
  diagnosis: { crop: 'Wheat', disease: 'Leaf rust', confidence: 91, affectedParts: ['Leaves'], severity: 'High', description: 'Emulator fixture', expertReviewRequired: false, visualHighlights: [], plan: { steps: [], totalCost: 0, timeline: '1 week', preventionTips: ['Monitor the plant'] } },
};

test('My Crops persists user-created cards and immutable records, enforces atomic names and owner access', { skip: !process.env.FIRESTORE_EMULATOR_HOST, timeout: 45000 }, async () => {
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'demo-agriguard-copy';
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'test-key';
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'demo-agriguard-copy.firebaseapp.com';
  const { getApp, getDb } = await import('../src/lib/firestore');
  const { deleteCrop } = await import('../src/lib/my-crops/delete-crop');
  const { addCrop, startPlantRecord, finishPlantRecord, failPlantRecord, plantNameExists } = await import('../src/lib/my-crops/repository');
  const app = getApp(), db = getDb(), auth = getAuth(app);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(':');
  connectFirestoreEmulator(db, host, Number(port));
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const { user } = await signInAnonymously(auth);
  const uid = user.uid;
  const { verifyCropUser } = await import('../src/lib/server/verify-user');
  assert.equal((await verifyCropUser(await user.getIdToken())).uid, uid);
  await assert.rejects(verifyCropUser(''), /Sign in/);
  await assert.rejects(verifyCropUser('invalid-token'), /verified/);
  let stop = () => {};
  try {
    assert.equal((await getDocs(collection(db, 'users', uid, 'crops'))).size, 0, 'new account is empty');
    const cropId = await addCrop(uid, 'Wheat');
    const customCropId = await addCrop(uid, 'My custom crop');
    await assert.rejects(addCrop(uid, '  WHEAT  '), /already/);
    const cropRef = doc(db, 'users', uid, 'crops', cropId);
    assert.equal((await getDoc(cropRef)).data()?.plantCount, 0);
    const parallel = await Promise.allSettled([
      startPlantRecord(uid, cropId, input),
      startPlantRecord(uid, cropId, { ...input, name: '  plant   a  ' }),
    ]);
    assert.equal(parallel.filter(item => item.status === 'fulfilled').length, 1, 'one concurrent duplicate wins');
    assert.match((parallel.find(item => item.status === 'rejected') as PromiseRejectedResult).reason.message, /name is already in use/);
    const first = (parallel.find(item => item.status === 'fulfilled') as PromiseFulfilledResult<{ plantId: string; reportId: string }>).value;
    const plantRef = doc(cropRef, 'plants', first.plantId);
    const firstRecordRef = doc(plantRef, 'records', first.reportId);
    assert.equal((await getDoc(cropRef)).data()?.plantCount, 1);
    assert.equal((await getDoc(plantRef)).data()?.code, 'WH-001');
    assert.equal(await plantNameExists(uid, cropId, 'PLANT A'), true);
    assert.equal((await getDoc(firstRecordRef)).data()?.status, 'Processing');
    await finishPlantRecord(uid, cropId, first.plantId, first.reportId, analysis);
    const initialSnapshot = (await getDoc(firstRecordRef)).data();
    assert.equal(initialSnapshot?.severityScore, 70);
    assert.equal(initialSnapshot?.diagnosis.confidence, 91, 'confidence is separate from severity');
    assert.equal((await getDoc(doc(db, 'users', uid, 'reports', first.reportId))).data()?.status, 'Complete');
    const live = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeline did not update live')), 8000);
      stop = onSnapshot(collection(plantRef, 'records'), snapshot => { if (snapshot.size === 2) { clearTimeout(timer); resolve(); } }, reject);
    });
    const followUp = await startPlantRecord(uid, cropId, { ...input, plantId: first.plantId, age: '7 months' });
    await live;
    await finishPlantRecord(uid, cropId, first.plantId, followUp.reportId, { ...analysis, severityScore: 30 });
    assert.deepEqual((await getDoc(firstRecordRef)).data(), initialSnapshot, 'follow-up leaves old photo, date and result intact');
    await finishPlantRecord(uid, cropId, first.plantId, first.reportId, { ...analysis, severityScore: 1 });
    assert.deepEqual((await getDoc(firstRecordRef)).data(), initialSnapshot, 'retry cannot overwrite completed record');
    assert.equal((await getDoc(plantRef)).data()?.latestSeverityScore, 30);
    assert.equal((await getDoc(plantRef)).data()?.recordCount, 2);
    assert.equal((await getDoc(cropRef)).data()?.plantCount, 1);
    const failed = await startPlantRecord(uid, cropId, { ...input, plantId: first.plantId });
    await failPlantRecord(uid, cropId, first.plantId, failed.reportId, 'Temporary AI failure');
    assert.equal((await getDoc(doc(plantRef, 'records', failed.reportId))).data()?.status, 'Error');
    await finishPlantRecord(uid, cropId, first.plantId, failed.reportId, { ...analysis, severityScore: null });
    assert.equal((await getDoc(doc(plantRef, 'records', failed.reportId))).data()?.status, 'Complete');
    assert.equal((await getDoc(plantRef)).data()?.recordCount, 3, 'retry reuses saved record');
    const older = await startPlantRecord(uid, cropId, { ...input, plantId: first.plantId });
    const newer = await startPlantRecord(uid, cropId, { ...input, plantId: first.plantId });
    await finishPlantRecord(uid, cropId, first.plantId, newer.reportId, { ...analysis, severityScore: 20 });
    await finishPlantRecord(uid, cropId, first.plantId, older.reportId, { ...analysis, severityScore: 80 });
    assert.equal((await getDoc(plantRef)).data()?.latestSeverityScore, 20, 'late older response cannot replace latest result');
    const second = await startPlantRecord(uid, cropId, { ...input, name: 'Plant B' });
    assert.equal((await getDoc(doc(cropRef, 'plants', second.plantId))).data()?.code, 'WH-002');
    await startPlantRecord(uid, customCropId, input); // Same name is permitted in another crop.
    await assert.rejects(startPlantRecord(uid, cropId, { ...input, name: 'Plant C', imageThumb: 'invalid' }), /photo/);
    assert.equal((await getDocs(collection(cropRef, 'plants'))).size, 2, 'failed input creates no partial plant');
    await assert.rejects(getDoc(doc(db, 'users', 'different-user', 'crops', cropId)), /permission/i);
    await assert.rejects(setDoc(doc(db, 'users', 'different-user', 'crops', cropId, 'plants', first.plantId), { name: 'Intruder' }), /permission/i);
    // Multiple pages of photo records must be removed, not only the crop document.
    for (let index = 0; index < 11; index++) await startPlantRecord(uid, cropId, { ...input, plantId: first.plantId });
    const oldCrop = { id: cropId, createdAt: (await getDoc(cropRef)).data()!.createdAt };
    const reportsBeforeDelete = await getDocs(query(collection(db, 'users', uid, 'reports'), where('cropId', '==', cropId)));
    const unrelated = doc(db, 'users', uid, 'reports', 'unrelated-report');
    await setDoc(unrelated, { uid, crop: 'Wheat', status: 'Complete' });
    await updateDoc(cropRef, { deletingAt: new Date().toISOString() }); // Simulate resuming interrupted deletion.
    await assert.rejects(startPlantRecord(uid, cropId, { ...input, name: 'Blocked plant' }), /being deleted/);
    await assert.rejects(finishPlantRecord(uid, cropId, second.plantId, second.reportId, analysis), /being deleted/);
    await deleteCrop(uid, oldCrop);
    assert.equal((await getDoc(cropRef)).exists(), false);
    assert.equal((await getDocs(collection(cropRef, 'plants'))).size, 0);
    assert.equal((await getDocs(collection(plantRef, 'records'))).size, 0);
    assert.equal((await getDocs(query(collection(db, 'users', uid, 'reports'), where('cropId', '==', cropId)))).size, 0);
    for (const report of reportsBeforeDelete.docs) assert.equal((await getDoc(doc(db, 'users', uid, 'notifications', `diagnosis_${report.id}`))).exists(), false);
    assert.equal((await getDoc(unrelated)).exists(), true, 'standalone reports are preserved');
    assert.equal((await getDoc(doc(db, 'users', uid, 'crops', customCropId))).exists(), true, 'other crops are preserved');
    await deleteCrop(uid, oldCrop); // Idempotent repeat.
    assert.equal(await addCrop(uid, 'Wheat'), cropId);
    const replacement = await startPlantRecord(uid, cropId, input);
    await deleteCrop(uid, oldCrop); // A stale dialog in another tab cannot delete the replacement.
    assert.equal((await getDoc(doc(cropRef, 'plants', replacement.plantId))).exists(), true);
    const emptyId = await addCrop(uid, 'Empty crop');
    await deleteCrop(uid, { id: emptyId, createdAt: (await getDoc(doc(db, 'users', uid, 'crops', emptyId))).data()!.createdAt });
    assert.equal((await getDoc(doc(db, 'users', uid, 'crops', emptyId))).exists(), false);
    await assert.rejects(deleteCrop('different-user', oldCrop), /permission/i);

  } finally { stop(); await terminate(db); await deleteApp(app); }
});
