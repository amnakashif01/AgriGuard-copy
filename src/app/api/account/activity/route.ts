import { checkOrigin, signedInAccount, ownerFailure } from '@/lib/server/owner-auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { db, account } = await signedInAccount(request);
    const ref = db.doc(`account_presence/${account.uid}`);
    const now = new Date().toISOString();
    await db.runTransaction(async transaction => {
      const previous = await transaction.get(ref);
      // Multiple tabs cannot create an unbounded write stream.
      if (Date.now() - Date.parse(previous.data()?.lastSeenAt || '') < 45000) return;
      transaction.set(ref, { lastSeenAt: now });
    });
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return ownerFailure(error); }
}
