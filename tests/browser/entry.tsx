import React from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously, linkWithCredential, EmailAuthProvider, signInWithCredential } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, doc, setDoc, getDoc, terminate } from 'firebase/firestore';
import { getApp, getDb } from '../../src/lib/firestore';
import { SupplierCard } from '../../src/components/agrisahayak/suppliers-card';
import { DeleteRecordButton } from '../../src/components/my-crops/delete-record-button';
import CropModelEvidence from '../../src/components/agrisahayak/crop-model-evidence';
import { chooseDetectorEvidence, chooseClassifierEvidence, DETECTOR_REVISION } from '../../src/lib/crop-detector';
import { CLASSIFIER_REVISION } from '../../src/lib/crop-classifier';
import type { NotificationData } from '../../src/lib/notifications';
import type { AdminSnapshot } from '../../src/lib/activity-data';

const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const stops: (() => void)[] = [];
function waitFor<T>(subscribe: (receive: (value: T) => void, fail: (error: Error) => void) => () => void, accept: (value: T) => boolean, stage: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out: ${stage}`)), 10000);
    const stop = subscribe(value => { if (accept(value)) { clearTimeout(timer); resolve(value); } }, error => { clearTimeout(timer); reject(error); });
    stops.push(() => { clearTimeout(timer); stop(); });
  });
}

async function run() {
  const app = getApp(), db = getDb(), auth = getAuth(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8089);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const { user } = await signInAnonymously(auth);
  const credential = EmailAuthProvider.credential(`browser-${crypto.randomUUID()}@example.test`, 'emulator-only-password');
  await linkWithCredential(user, credential);
  const secondApp = initializeApp(app.options, 'second-browser-client');
  const secondDb = getFirestore(secondApp), secondAuth = getAuth(secondApp);
  connectFirestoreEmulator(secondDb, '127.0.0.1', 8089);
  connectAuthEmulator(secondAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  await signInWithCredential(secondAuth, credential);
  const notifications = await import('../../src/lib/notifications');
  const { subscribeAdminActivity } = await import('../../src/lib/admin-activity');
  const { deleteReport } = await import('../../src/lib/repositories');
  const alert = waitFor<NotificationData[]>((receive, fail) => notifications.subscribeUserNotifications(user.uid, receive, fail), items => items.some(item => item.id === 'cross-client'), 'cross-client notification');
  await setDoc(doc(secondDb, 'users', user.uid, 'notifications', 'cross-client'), { userId: user.uid, title: 'Cross-client update', body: 'Browser emulator fixture', type: 'system_update', read: false, priority: 'normal', createdAt: new Date() });
  const items = await alert;
  await notifications.markNotificationAsRead(user.uid, items.find(item => item.id === 'cross-client')!);
  check((await getDoc(doc(secondDb, 'users', user.uid, 'notifications', 'cross-client'))).data()?.read, 'Read state must persist across clients');
  const adminUpdate = waitFor<AdminSnapshot>((receive, fail) => subscribeAdminActivity(user.uid, false, receive, text => fail(new Error(text))), view => view.stats.totalReportsToday === 1, 'admin report update');
  const recoveredAlert = waitFor<NotificationData[]>((receive, fail) => notifications.subscribeUserNotifications(user.uid, receive, fail), values => values.some(item => item.data?.reportId === 'saved-report'), 'recovered report alert');
  await setDoc(doc(secondDb, 'users', user.uid, 'reports', 'saved-report'), { uid: user.uid, crop: 'Maize', disease: 'Common Rust', severity: 'Medium', confidence: 90, status: 'Complete', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  check((await adminUpdate).stats.avgConfidence === '90%', 'Admin totals must reflect saved report');
  const recovered = (await recoveredAlert).find(item => item.data?.reportId === 'saved-report')!;
  await notifications.markAllNotificationsAsRead(user.uid, [recovered]);
  check((await getDoc(doc(secondDb, 'users', user.uid, 'notifications', recovered.id))).data()?.read, 'Recovered alert read state must persist');
  let reportSeen = false;
  const removedAlert = waitFor<NotificationData[]>((receive, fail) => notifications.subscribeUserNotifications(user.uid, receive, fail), values => {
    const found = values.some(item => item.data?.reportId === 'saved-report');
    if (found) reportSeen = true;
    return reportSeen && !found;
  }, 'deleted report alert removed');
  await deleteReport(user.uid, 'saved-report');
  await removedAlert;
  for (const reference of [doc(db, 'users', 'other-user', 'notifications', 'private'), doc(db, 'logs', 'private')]) {
    let denied = false;
    try { await getDoc(reference); } catch (error: any) { denied = error.code === 'permission-denied'; }
    check(denied, 'Owner access must remain enforced');
  }

  const { addCrop, startPlantRecord, finishPlantRecord } = await import('../../src/lib/my-crops/repository');
  const { deletePlantRecord } = await import('../../src/lib/my-crops/delete-record');
  const cropId = await addCrop(user.uid, 'Maize');
  const input = { name: 'Browser test plant', age: '2 months', symptoms: 'Fixture', imageThumb: 'data:image/jpeg;base64,/9j/2Q==', analysisImage: 'data:image/jpeg;base64,/9j/2Q==' };
  const first = await startPlantRecord(user.uid, cropId, input);
  const second = await startPlantRecord(user.uid, cropId, { ...input, plantId: first.plantId });
  const diagnosis = { crop: 'Maize', disease: 'Common Rust', confidence: 90, affectedParts: ['Leaves'], severity: 'Medium' as const, description: 'Browser fixture', visualHighlights: [], expertReviewRequired: false };
  for (const record of [first, second]) await finishPlantRecord(user.uid, cropId, first.plantId, record.reportId, { severityScore: 30, severityExplanation: 'Fixture', diagnosis });
  const leaf = chooseDetectorEvidence({ model: 'YOLO11m PlantDoc', revision: DETECTOR_REVISION, status: 'detected', elapsedMs: 700, detections: [{ classId: 9, label: 'Corn rust leaf', score: 90.19, box: [0, 0, 1000, 1000] }] }, 'Maize');
  const broad = chooseClassifierEvidence(leaf, { model: 'DaViT-Base', revision: CLASSIFIER_REVISION, status: 'classified', elapsedMs: 400, prediction: { crop: { label: 'maize', score: 90.5 }, category: { label: 'pest/weed', score: 92.4 }, condition: { label: 'fall armyworm', score: 90.67 }, cropMasked: false } }, 'Maize');
  createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-5xl space-y-6 p-4"><h1 className="text-2xl font-semibold">AgriGuard component verification</h1><CropModelEvidence evidence={leaf} /><CropModelEvidence evidence={broad} /><SupplierCard index={0} supplier={{ id: 'local-fixture', name: 'Local supplier fixture', type: 'supplier', location: { address: 'Fixture address', city: 'Lahore', province: 'Punjab', coordinates: { lat: 31.52, lng: 74.35 } }, products: ['Seeds', 'Plant nutrients', 'Crop protection', 'Equipment'], services: [], contact: { phone: '+923001234567', whatsapp: '+923001234567' }, rating: 4.6, distance: 1.2, availability: 'available', pricing: { competitive: true }, verification: { verified: false } }} /><DeleteRecordButton label="selected test report" onDelete={() => deletePlantRecord(user.uid, cropId, first.plantId, second.reportId)} /></main>);
  (window as any).verification = {
    status: async () => ({ selectedExists: (await getDoc(doc(db, 'users', user.uid, 'reports', second.reportId))).exists(), otherExists: (await getDoc(doc(db, 'users', user.uid, 'reports', first.reportId))).exists(), plant: (await getDoc(doc(db, 'users', user.uid, 'crops', cropId, 'plants', first.plantId))).data(), cropExists: (await getDoc(doc(db, 'users', user.uid, 'crops', cropId))).exists() }),
    close: async () => { stops.forEach(stop => stop()); await Promise.all([terminate(db), terminate(secondDb)]); await Promise.all([deleteApp(app), deleteApp(secondApp)]); },
    ready: true,
  };
}
void run().catch(error => { (window as any).verification = { error: String(error?.stack || error) }; });
