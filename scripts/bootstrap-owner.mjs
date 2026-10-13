// Run locally with server credentials and OWNER_INITIAL_PASSWORD in a private environment.
// Never add either secret to source control or NEXT_PUBLIC_* environment variables.
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = 'agriguard-copy-3c4dd';
const email = 'admin.agriguard@gmail.com';
try {
  const service = JSON.parse(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT || '{}');
  if (service.project_id !== projectId || !service.client_email || !service.private_key) throw new Error('A server service account for the COPY Firebase project is required.');
  const app = initializeApp({ credential: cert(service), projectId });
  const auth = getAuth(app);
  const db = getFirestore(app);
  db.settings({ preferRest: true });
  let account;
  try { account = await auth.getUserByEmail(email); }
  catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
  if (account && account.uid !== process.env.OWNER_EXISTING_UID) throw new Error('This email already has an account. Verify its UID and supply OWNER_EXISTING_UID before assigning the owner role. The password will remain unchanged.');
  if (!account) {
    const password = process.env.OWNER_INITIAL_PASSWORD;
    if (!password || password.length < 8) throw new Error('Set OWNER_INITIAL_PASSWORD securely before creating the app account.');
    account = await auth.createUser({ email, password, displayName: 'AgriGuard Owner' });
  }
  if (account.disabled) throw new Error('The chosen account is disabled. Resolve its status before assigning ownership.');
  await auth.setCustomUserClaims(account.uid, { ...account.customClaims, admin: true, owner: true });
  const profile = db.doc(`profiles/${account.uid}`);
  if (!(await profile.get()).exists) await profile.set({ uid: account.uid, name: 'AgriGuard Owner', phone: '', email, location: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await db.terminate();
  console.log('Owner role configured for the designated AgriGuard COPY account. Sign in again to refresh permissions.');
} catch (error) {
  // Firebase error text can contain request details; do not dump objects or secrets.
  console.error(error.code ? `Owner setup failed (${error.code}).` : error.message);
  process.exitCode = 1;
}
