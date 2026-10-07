import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously, signInWithCredential, EmailAuthProvider, linkWithCredential } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, terminate } from 'firebase/firestore';

test('live notifications, read state and admin updates work with owner rules across clients', { skip: !process.env.FIRESTORE_EMULATOR_HOST, timeout: 25000 }, async () => {
  // This suite can only run against local emulators, never the production project.
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'demo-agriguard-copy';
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'test-key';
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'demo-agriguard-copy.firebaseapp.com';
  const { getApp, getDb } = await import('../src/lib/firestore');
  const app = getApp();
  const db = getDb();
  const auth = getAuth(app);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(':');
  connectFirestoreEmulator(db, host, Number(port));
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const { user } = await signInAnonymously(auth);
  const credential = EmailAuthProvider.credential('local-fixture@example.test', 'emulator-only-password');
  await linkWithCredential(user, credential);
  const secondApp = initializeApp(app.options, 'second-client');
  const secondDb = getFirestore(secondApp);
  const secondAuth = getAuth(secondApp);
  connectFirestoreEmulator(secondDb, host, Number(port));
  connectAuthEmulator(secondAuth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  await signInWithCredential(secondAuth, credential);
  const notifications = await import('../src/lib/notifications');
  const { subscribeAdminActivity } = await import('../src/lib/admin-activity');
  const stops: (() => void)[] = [];
  const waitFor = <T>(subscribe: (receive: (value: T) => void, fail: (error: Error) => void) => () => void, accept: (value: T) => boolean) => new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Live update timed out')), 8000);
    stops.push(subscribe(value => { if (accept(value)) { clearTimeout(timer); resolve(value); } }, error => { clearTimeout(timer); reject(error); }));
  });
  try {
    const liveAlert = waitFor<import('../src/lib/notifications').NotificationData[]>((receive, fail) => notifications.subscribeUserNotifications(user.uid, receive, fail), items => items.some(item => item.title === 'Cross-client update'));
    await setDoc(doc(secondDb, 'users', user.uid, 'notifications', 'cross-client'), {
      id: 'cross-client', userId: user.uid, title: 'Cross-client update', body: 'Emulator fixture', type: 'system_update', read: false, priority: 'normal', createdAt: new Date(),
    });
    const items = await liveAlert;
    await notifications.markNotificationAsRead(user.uid, items[0]);
    assert.equal((await getDoc(doc(secondDb, 'users', user.uid, 'notifications', 'cross-client'))).data()?.read, true);
    const adminUpdate = waitFor<import('../src/lib/activity-data').AdminSnapshot>((receive, fail) => subscribeAdminActivity(user.uid, false, receive, message => fail(new Error(message))), view => view.stats.totalReportsToday === 1);
    const reportAlert = waitFor<import('../src/lib/notifications').NotificationData[]>((receive, fail) => notifications.subscribeUserNotifications(user.uid, receive, fail), items => items.some(item => item.data?.reportId === 'saved-report'));
    await setDoc(doc(secondDb, 'users', user.uid, 'reports', 'saved-report'), {
      uid: user.uid, crop: 'Tomato', disease: 'Early Blight', severity: 'Medium', confidence: 90,
      status: 'Complete', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    assert.equal((await adminUpdate).stats.avgConfidence, '90%');
    const recovered = (await reportAlert).find(item => item.data?.reportId === 'saved-report')!;
    await notifications.markAllNotificationsAsRead(user.uid, [recovered]);
    assert.equal((await getDoc(doc(secondDb, 'users', user.uid, 'notifications', recovered.id))).data()?.read, true);
    await assert.rejects(getDoc(doc(db, 'users', 'other-user', 'notifications', 'private')), /permission/i);
    await assert.rejects(setDoc(doc(db, 'users', 'other-user', 'notifications', 'private'), { read: true }), /permission/i);
    await assert.rejects(getDoc(doc(db, 'logs', 'private')), /permission/i);
  } finally {
    stops.forEach(stop => stop());
    await Promise.all([terminate(db), terminate(secondDb)]);
    await Promise.all([deleteApp(app), deleteApp(secondApp)]);
  }
});
