import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// ID-token verification only needs the project ID and Google's public signing
// certificates. This does not grant database/admin access or require a service key.
export async function verifyCropUser(idToken: string) {
  if (typeof idToken !== 'string' || !idToken || idToken.length > 10000) throw new Error('Sign in to analyze your plant.');
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('Plant analysis is not configured.');
  const app = getApps().find(app => app.name === 'crop-token-verifier') || initializeApp({ projectId }, 'crop-token-verifier');
  try { return await getAuth(app).verifyIdToken(idToken); }
  catch { throw new Error('Your session could not be verified. Please sign in again.'); }
}
