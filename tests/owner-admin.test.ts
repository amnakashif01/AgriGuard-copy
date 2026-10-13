import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasOwnerRole, isRecentlyActive, ownerActionSchema, OWNER_EMAIL } from '../src/lib/owner-admin';
import { checkOrigin, OwnerError } from '../src/lib/server/owner-auth';

test('owner access requires the trusted owner claim, admin claim and designated identity together', () => {
  assert.equal(hasOwnerRole({ email: OWNER_EMAIL }), false);
  assert.equal(hasOwnerRole({ email: OWNER_EMAIL, admin: true }), false);
  assert.equal(hasOwnerRole({ email: 'demo@agriguard.example', admin: true, owner: true }), false);
  assert.equal(hasOwnerRole({ email: OWNER_EMAIL, admin: 'true', owner: true }), false);
  assert.equal(hasOwnerRole({ email: OWNER_EMAIL, admin: true, owner: true }), true);
});
test('admin writes reject privilege fields, traversal identifiers and oversized input', () => {
  const input = { action: 'profile.update', uid: 'farmer-1', version: 'missing', name: 'Ali', location: 'Lahore' };
  assert.equal(ownerActionSchema.safeParse(input).success, true);
  for (const change of [{ uid: '../another' }, { uid: 'users/another' }, { name: '' }, { name: 'x'.repeat(81) }, { admin: true }, { email: OWNER_EMAIL }, { password: 'unexpected' }]) assert.equal(ownerActionSchema.safeParse({ ...input, ...change }).success, false);
  assert.equal(ownerActionSchema.safeParse({ action: 'account.delete', uid: 'farmer-1' }).success, false);
});
test('presence is based on a recent real heartbeat and rejects future/invalid timestamps', () => {
  const now = Date.parse('2026-10-13T15:00:00Z');
  assert.equal(isRecentlyActive('2026-10-13T14:59:30Z', now), true);
  assert.equal(isRecentlyActive('2026-10-13T14:58:00Z', now), false);
  assert.equal(isRecentlyActive('2026-10-13T15:00:01Z', now), false);
  assert.equal(isRecentlyActive(null, now), false);
});
test('owner endpoint blocks cross-origin browser submissions', () => {
  assert.doesNotThrow(() => checkOrigin(new Request('https://agri-guard-copy.vercel.app/api/owner', { headers: { origin: 'https://agri-guard-copy.vercel.app' } })));
  assert.throws(() => checkOrigin(new Request('https://agri-guard-copy.vercel.app/api/owner', { headers: { origin: 'https://attacker.example' } })), OwnerError);
});
