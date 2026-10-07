import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { getDb } from './firestore';
import { buildAdminSnapshot, type AdminSnapshot } from './activity-data';
import type { AdminLog, DiagnosisReport } from './models';

export function subscribeAdminActivity(
  uid: string,
  globalAccess: boolean,
  onUpdate: (snapshot: AdminSnapshot) => void,
  onError: (message: string) => void,
): () => void {
  const db = getDb();
  let reports: DiagnosisReport[] | null = globalAccess ? null : [];
  let logs: AdminLog[] = [];
  let userCount = 0;
  const emit = () => onUpdate(buildAdminSnapshot(reports, logs, userCount));
  const fail = (section: string) => (error: Error) => {
    console.error(`Admin ${section} subscription failed:`, error);
    onError(`Could not load ${section}. Check your connection and try Refresh.`);
  };
  const subscriptions = [onSnapshot(
    query(globalAccess ? collection(db, 'logs') : collection(db, 'users', uid, 'logs'), orderBy('timestamp', 'desc'), limit(1000)),
    snapshot => { logs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as AdminLog); emit(); },
    fail('activity logs'),
  )];
  if (globalAccess) {
    subscriptions.push(onSnapshot(collection(db, 'profiles'), snapshot => { userCount = snapshot.size; emit(); }, fail('registered users')));
  } else {
    // Public demo accounts have access to their own data, not every user's private records.
    subscriptions.push(onSnapshot(collection(db, 'users', uid, 'reports'), snapshot => {
      reports = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as DiagnosisReport); emit();
    }, fail('reports')));
    subscriptions.push(onSnapshot(doc(db, 'profiles', uid), snapshot => { userCount = snapshot.exists() ? 1 : 0; emit(); }, fail('profile')));
  }
  return () => subscriptions.forEach(unsubscribe => unsubscribe());
}
