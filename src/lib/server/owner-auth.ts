import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { hasOwnerRole } from '../owner-admin';

export class OwnerError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function adminServices() {
  if (typeof window !== 'undefined') throw new Error('Server module.');
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new OwnerError('Owner management is not configured yet.', 503);
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST && projectId.startsWith('demo-');
  let app = getApps().find(item => item.name === 'owner-management');
  if (!app) {
    if (emulator) app = initializeApp({ projectId }, 'owner-management');
    else {
      let service: { project_id?: string; client_email?: string; private_key?: string };
      try { service = JSON.parse(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT || '{}'); }
      catch { throw new OwnerError('Owner management is not configured yet.', 503); }
      if (service.project_id !== projectId || !service.client_email || !service.private_key) throw new OwnerError('Owner management is not configured yet.', 503);
      app = initializeApp({ credential: cert({ projectId, clientEmail: service.client_email, privateKey: service.private_key }), projectId, storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET }, 'owner-management');
    }
    getFirestore(app).settings({ preferRest: !emulator });
  }
  return { auth: getAuth(app), db: getFirestore(app), storage: getStorage(app) };
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new OwnerError('This request is not allowed.', 403);
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new OwnerError('This request is not allowed.', 403);
}
export async function signedInAccount(request: Request) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ') || header.length > 10007) throw new OwnerError('Please sign in to continue.', 401);
  const services = adminServices();
  let token;
  let account;
  try {
    token = await services.auth.verifyIdToken(header.slice(7), true);
    account = await services.auth.getUser(token.uid);
  } catch (error) {
    const code = (error as { code?: string }).code || '';
    if (/id-token|argument|user-disabled|user-not-found/.test(code)) throw new OwnerError('Your session has expired or this account is unavailable. Please sign in again.', 401);
    throw new OwnerError('Account verification is temporarily unavailable. Please try again.', 503);
  }
  const control = await services.db.doc(`account_controls/${token.uid}`).get();
  if (account.disabled || control.data()?.disabled) throw new OwnerError('This account is unavailable. Please sign in again.', 401);
  return { ...services, token, account };
}
export async function requireOwner(request: Request) {
  checkOrigin(request);
  const context = await signedInAccount(request);
  if (!hasOwnerRole(context.token) || !hasOwnerRole({ ...context.account.customClaims, email: context.account.email })) throw new OwnerError('Only the website owner can manage farmer accounts.', 403);
  return context;
}
export function ownerFailure(error: unknown) {
  if (error instanceof OwnerError) return Response.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'private, no-store' } });
  console.error('Owner management operation failed', { code: (error as { code?: string })?.code || 'unknown' });
  return Response.json({ error: 'The operation could not be completed. Refresh the record before retrying.' }, { status: 500, headers: { 'Cache-Control': 'private, no-store' } });
}
