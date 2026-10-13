# AgriGuard COPY owner panel

Target: `agri-guard-copy.vercel.app`, Firebase project `agriguard-copy-3c4dd`.

The designated app account is `admin.agriguard@gmail.com`. Owner access requires
both server-issued `admin: true` and `owner: true` custom claims plus this email.
An email match alone never grants access. The API verifies the current Firebase
user record as well as the token, so removing the role takes effect immediately.
Ordinary farmers and the public email demo retain their personal activity view.

## Release configuration

1. Configure `FIREBASE_ADMIN_SERVICE_ACCOUNT` as a sensitive, server-only Vercel
   environment variable for this COPY project. Its JSON `project_id` must match
   `NEXT_PUBLIC_FIREBASE_PROJECT_ID`. Do not prefix this secret with `NEXT_PUBLIC_`.
   The service identity needs Firebase Authentication user administration,
   Firestore data access and access to the app's stored crop/profile images.
2. Publish the root `firestore.rules` to the COPY project's default database.
3. Run `node scripts/bootstrap-owner.mjs` in a trusted environment with the same
   server credential and a securely supplied `OWNER_INITIAL_PASSWORD`. The script
   only creates the designated app account; it does not create a Gmail inbox.
   If the email already exists, inspect its UID and provide `OWNER_EXISTING_UID`;
   existing passwords are never reset by this script.
4. Redeploy and sign in again. Verify the owner directory and the ordinary demo
   account's personal view. Remove the bootstrap password from the environment
   after setup; it is not a runtime setting.

## Behavior

- Counts come from Firebase Auth and saved Firestore records. Active now means a
  visible authenticated browser sent a server-verified heartbeat within 2 minutes.
- Searchable account directory, paged crops/reports, saved diagnosis details,
  profile/crop edits, suspend/restore and typed-confirmation deletion.
- Version checks reject edits made against stale records. Deleting a crop removes
  its descendants and associated reports/diagnosis notifications. Deleting a
  farmer removes their Firebase login, private data tree, profile, marketplace
  listings and saved supplier contacts/ratings. Audit entries are retained.
- Owner accounts cannot be suspended or deleted through this panel. No password,
  password hash, refresh token or service credential is returned to the browser.
- Failed destructive operations leave the account/crop blocked; refresh and retry
  after resolving the underlying problem. For very large accounts, a queued
  deletion worker would be needed beyond the current function's time limit.

## Checks

`npm run typecheck` and `npm test`.

Isolated permissions and lifecycle integration test (disposable emulator only):

```sh
npx --yes firebase-tools@14.20.0 emulators:exec --project demo-agriguard-owner --config firebase.owner-test.json --only auth,firestore 'node --import tsx --test tests/owner-admin.integration.test.ts'
```

This test covers owner-only access, stale edits, crop descendant cleanup, account
suspension/restoration/deletion, owner protection, Firestore isolation and role
revocation without touching production accounts.

## Limited farmer community

The Admin section also offers a read-only farmer community. Profiles and crop
experiences are opt-in: farmers choose a public display name, optional city and
specific completed reports. Only crop, saved diagnosis/care-plan and explicitly
entered treatment/progress are projected into server-managed community records.
Email, phone, exact location, photos, private symptoms and raw report history are
never copied. The API always derives write ownership from the verified token; it
accepts no client-supplied user ID for mutations. Unsharing removes projections;
account deletion removes the shared profile and crop deletion removes linked cases.
Suspended users cannot access the community or appear in its directory.

## Validation for this change

TypeScript passed; 97 unit/regression tests passed (3 emulator-only tests are
skipped by the normal command). The owner/community Firebase emulator lifecycle
test passed separately. Next.js production compilation and route generation
passed. Full model packaging could not be rerun locally because the environment
blocked the pinned Python dependency download from pypi.org; the existing model
export/build scripts are unchanged. A live owner login and browser management
check still require the server credential and role bootstrap described above.

## Complete farmer workspaces (October 2026)

The owner directory now opens a full-width account workspace. Owners can inspect crops, plants and scans, open full reports including treatment/protection plans and report revisions, edit crop/plant details, diagnosis and care/progress notes, and saved care plans. Owner profile settings include crop interests, language and notification preferences. The workspace also exposes saved fields, marketplace listings, supplier contact history, reviews, notifications and account activity. Saved marketplace/field/contact/review/notification records can be edited or deleted; audit logs are retained. Suspend/restore and typed-confirmation account deletion remain owner-only.

All workspace reads/mutations use the existing server-verified owner identity and claims. Record writes validate versions and ownership; report deletion maintains plant history/count/latest pointers, and plant deletion removes linked reports. Crop and account deletion retain their existing descendant cleanup. No impersonation login or password access is introduced.

### Farmer community

Inside Admin, one “Share my information” switch grants read-only access to the farmer's name/city, crops, plants, images, full report content, care history and progress. It does not share profile contact fields, precise location, account preferences, marketplace records or raw logs. Comparisons select scans from the same plant; the UI distinguishes saved diagnoses/progress from independently verified improvement.

`community_profiles/{uid}` now requires `enabled: true` AND `sharingVersion: 2`. Previous per-report consent is intentionally insufficient: users choose the new switch to opt in. OFF immediately blocks new profile and nested report/plant requests. Users can browse consenting farmers while their own sharing is OFF. Ordinary users cannot submit writes for another UID, and the owner can hide a shared profile but cannot opt a farmer in.

Images are paginated separately from metadata. Remote report images are resolved only from that farmer's own configured Firebase Storage path; permanent storage tokens and arbitrary URLs are never sent through shared reports. Community data is projected through a field allowlist, and every nested read rechecks consent after loading. Responses use private/no-store caching. Open views refresh permission every minute.

### Validation

`npm run typecheck`; `npm test`; and the Firebase emulator integration test cover owner vs farmer access, legacy consent, immediate sharing revocation, private-field omission, stale write rejection, plant/report changes and deletion, ownership checks, account suspension/deletion, and Firestore client isolation. Existing owner and community data are not made public during deployment.
