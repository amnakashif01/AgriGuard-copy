# Season-based Health & Care

Target: AgriGuard **copy** project. Existing reports are retained; there is no bulk reassignment or year-based migration.

## Farmer flow

1. Open My Crops → Health & Care History. Create a crop, named field/plot/tree and growing season with its actual start date.
2. Open a completed diagnosis. Choose an existing care record or create a new season and link the report. Linking is optional and happens after diagnosis.
3. AI Suggested Care shows the saved care plan. “I plan to use this” records intention only.
4. Record the product or care action actually performed, date, notes and optional compressed photo. It may differ from AI advice.
5. Add dated follow-ups (Improved, No change, Worsened or Not yet checked). Earlier observations remain. A later diagnosis can be attached to a follow-up from the season workspace.
6. Finish the season with its harvest/end date. Next planting gets a new cycle. Permanent trees can retain their tree name across separate seasons.

Reports outside the season dates or for another crop/identified plant cannot be linked. A report with care entries cannot be unlinked, preserving treatment provenance. Corrections void entries with a reason and audit trail; the supporting photo is removed.

## Historical insight

The report loads earlier matching crop diagnoses in the background, including previous years. It compares saved disease labels and conservative known aliases, not speculative clinical similarity. Low-confidence or tentative labels are explicitly uncertain. Healthy records and different diseases are not called recurrences. Unassigned legacy reports remain labelled “Season not assigned”. Overlapping/newer season starts are not described as previous seasons.

Cards distinguish actual farmer treatment, AI intention and farmer-reported outcome. Previous improvement does not prove treatment efficacy and does not recommend reusing a pesticide or dose. A separate comparison view shows two seasons without implying that last year's harvested plant recovered this year.

This release does not have a verified Pakistan pesticide registration/dosage catalogue. AI guidance is labelled accordingly; local authorization and the current exact label must be checked. The official Punjab crop-protection literature link is a reference, not validation of any generated brand or rate.

## Storage and access

- `users/{uid}/careSeasons/{seasonId}`: crop, field/tree name, dates, cycle label/status.
- `.../events/{eventId}`: planned/applied/follow-up entries, optional AI suggestion snapshot, correction state.
- `.../images/{eventId}`: small supporting photo, fetched on demand.
- `users/{uid}/reports/{reportId}.careSeasonId`: optional relationship.
- `users/{uid}/careAudit`: actor and action log.
- `users/{uid}/careDeletionJobs`: resumable cleanup marker for deleted reports.

Authenticated server routes verify the live account and suspension state. Cross-account writes require the existing owner claims and owner email. Community access requires current opt-in on every request, is read-only, redacts free-form growing-area names, projects allowed fields and rechecks consent before returning. The UI refreshes community authorization each minute. No global cross-user cache. Existing own-account Firestore permissions are retained.

Mutations validate dates and parent records inside transactions, use stable retry identifiers, and use document versions for edits/corrections. Crop/report deletion removes linked care data; complete account deletion already recursively removes the user's tree.

## Performance and checks

No change to the diagnosis model pipeline or additional AI request. Care UI is dynamically imported. History uses bounded metadata projections and document cursors rather than large analysis images or offsets; supporting photos load only on request. More historical batches can be loaded across all years. Partial care histories are labelled and do not claim a final outcome.

Verified locally on 2026-10-13:

- TypeScript check passed.
- Unit/regression suite: 101 passed, 4 emulator-only tests skipped.
- Firebase emulator care lifecycle and existing owner/privacy lifecycle: both passed using the deployed `firestore.rules`.
- Next production compilation and static generation passed.
- Mocked diagnosis speed regression suite: 4 passed; one generation request remains one request. Measured test case before 974.6 ms, after 904.0 ms (test timing, **not** real external model latency).

Run integration checks with:

```sh
npx firebase-tools@14.20.0 emulators:exec --project demo-agriguard-owner --config firebase.owner-test.json --only auth,firestore 'node --import tsx --test --test-concurrency=1 tests/crop-care.integration.test.ts tests/owner-admin.integration.test.ts'
```

A fresh local model re-export failed the existing pinned-artifact checksum, so that artifact was not accepted or deployed. The successful Next compilation is separate from this model build. The deployment must pass the existing model export/integrity packaging checks with the approved model artifact. Live page timing and deployed UI are verified separately; public network/AI timing varies.
