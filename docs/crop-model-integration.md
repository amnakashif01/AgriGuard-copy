# Crop model integration and local verification

Verified locally on 2026-10-08, on branch `work/continue-model-verification`. These changes have not been pushed or deployed. The original repository and deployed applications were not modified.

## Implemented behavior

- Keep the existing YOLO11m PlantDoc candidate when it passes the existing image review. Try DigiGreen DaViT-Base when YOLO abstains or its candidate is rejected.
- DaViT runs locally through ONNX Runtime on the CPU. Crop, category, and condition scores must each reach 80%; incompatible crop names and generic labels are rejected. The displayed overall score is the lowest of the three scores, not a measured accuracy percentage.
- Accepted model candidates still need Gemini image review. The model supplies crop and condition; Gemini supplies care guidance and estimated severity/highlights. DaViT does not supply lesion boxes. Healthy results clear treatment and highlights.
- Show the model actually used in report badges and evidence details. Remove upstream source links from those UI components. Preserve uncertain fallback behavior.
- Keep supplier Call, WhatsApp, and Map actions at 40px height on desktop and mobile.
- Add confirmation-based deletion of a single plant record and its report/completion notification. Update plant count/latest-record metadata while retaining the crop, plant, and other reports. The main report deletion path uses the same cleanup for linked records. Guard against concurrent updates and late analysis completion recreating a deleted record.
- Leave the My Crops comparison design unchanged.

## Verification

| Check | Result |
| --- | --- |
| TypeScript (`npm run typecheck`) | Passed |
| Unit tests (`npm test`) | 69 passed, 0 failed; 2 emulator tests skipped in this command |
| Emulator integration (`npm run test:integration`) | Both integration tests passed, no skips |
| Production build (`npm run build`) | Passed with both model artifacts validated and included in the Next.js trace |
| Browser component checks | Chromium, 1366px and 390px; compact buttons, model attribution/source-link removal, deletion confirmation/cancel; no uncaught page errors |
| Reproducible model export | Exported again from pinned safetensors; exact ONNX SHA-256 matched |

Integration checks cover cross-client notification delivery/read persistence, administrative and recovered-report notifications, standalone and linked report deletion, owner restrictions, deletion races, parent/other-record preservation, and adding a record after a plant history becomes empty. Browser checks use real Firebase browser clients connected only to local Auth/Firestore emulators and actual application components/repository functions. They are not a signed-in test of the deployed application. Supplier authentication is stubbed in the component fixture; messaging is not sent.

The prior Node listener timeout reproduced an emulator/gRPC transport failure. The notification integration check now exercises the browser Firebase SDK, matching the application runtime, and passes. This verifies local browser behavior; it does not prove production push delivery. Related upstream report: [firebase-tools issue 8654](https://github.com/firebase/firebase-tools/issues/8654).

The existing Next.js configuration skips build-time type/lint checking. TypeScript was checked separately; lint was not used as a gate. Existing OpenTelemetry dynamic-import build warnings remain.

## Actual model smoke inference

These are three pre-review CPU inference examples, not an accuracy study. Input filenames describe the fixtures and are not independent expert diagnoses. The benchmark deliberately runs both models on each input; the production flow retains an accepted YOLO result without requiring DaViT.

| Input | YOLO candidate | DaViT result | Candidate outcome |
| --- | --- | --- | --- |
| Maize regression photo | None | Maize 90.51; pest/weed 92.45; Fall Armyworm 90.67 | DaViT candidate, overall score 90.51; Gemini review still required |
| Corn rust leaf photo | Common Rust 90.19 | Crop 89.24; category 71.81; condition 30.92 | Preserve accepted YOLO result; DaViT rejected |
| Tomato fruit report crop | None | Tomato 67.25; disease 66.15; Blossom End Rot 82.82 | DaViT rejected; use uncertain fallback |

DaViT measured 1,602ms for the first call and 400–420ms for subsequent calls in this process. Combined peak resident memory was approximately 1,046 MiB. These timings and memory use are local measurements, not serverless latency guarantees. Exact output is in [crop-model-smoke-results.json](crop-model-smoke-results.json).

## Reproduce locally

Use Node.js 24 and Java 17 or newer. Firebase Tools is pinned to 14.20.0 in the integration command.

```bash
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run test:integration
```

DaViT weights are intentionally excluded from Git. Build them before running the production build. Use an isolated Python 3.12 environment with the verified export dependencies:

```bash
python3 -m venv .venv-model
.venv-model/bin/python -m pip install torch==2.8.0 torchvision==0.23.0 --index-url https://download.pytorch.org/whl/cpu
.venv-model/bin/python -m pip install timm==1.0.22 safetensors==0.8.0 onnx==1.19.1
.venv-model/bin/python scripts/export-crop-classifier.py
npm run build
```

Optionally set `AGRIGUARD_SAFETENSORS` to an already downloaded source checkpoint. The exporter verifies its hash, reconstructs the architecture without executing publisher Python/pickle files, exports four heads, verifies the ONNX hash, and atomically installs the result. A differing export fails and requires reevaluation. On Vercel, missing weights are built automatically using pinned CPU export dependencies in a temporary Python 3.12 environment; that environment is removed before Next.js bundles the application. `scripts/prepare-crop-classifier.mjs` rejects modified weights or an unsuccessful export, so a deployment cannot silently ship without DaViT. The existing YOLO preparation script runs first during build.

Model source, pinned revisions, artifact sizes, and checksums are recorded in [manifest.json](../models/crop-disease/manifest.json). Label arrays and crop/disease masks come from the pinned DigiGreen Space revision recorded there.

To run additional local smoke inputs:

```bash
node --import tsx scripts/benchmark-crop-classifier.ts /absolute/path/to/photo.jpg
```

## Remaining live verification and deployment work

1. **Live Gemini review/report generation:** no Gemini credentials were available in this workspace. End-to-end live image review, generated care text, and production report persistence remain unverified.
2. **Hosting eligibility and packaging:** DaViT alone is 350,987,018 bytes. The report route's Next.js trace totals approximately 510.68 MB with both models and native dependencies. This is a trace estimate, not a measured Vercel deployment bundle. It exceeds the documented standard 250 MB function limit. Vercel documents a large-function beta using `VERCEL_SUPPORT_LARGE_FUNCTIONS=1`, subject to Fluid/Active CPU and project eligibility; those settings were not changed or verified. See [Vercel function limits](https://vercel.com/docs/functions/limitations).
3. **Artifact delivery:** Git excludes the binaries. The Vercel build now exports the pinned DaViT checkpoint automatically when the artifact is missing and validates its exact hash. The Python build tools are temporary and are not shipped with the Node.js runtime.
4. **Connected project access:** the connected Vercel account did not expose the copied project, so its configuration could not be inspected. Confirm project access, model packaging, runtime memory/latency, and live Gemini behavior before requesting deployment approval.

No push, deployment, production data mutation, or outgoing user message was performed during this continuation.

## Deployment continuation — 2026-10-09

The user approved production deployment. The existing browser session has access to the correct copied Vercel project, while the connected Vercel API account does not. Fluid Compute was already enabled; `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` was added to the copied project's Production configuration. The existing Google API secret remains configured without being read or changed.

The first remote build successfully exported and verified DaViT, then hit the Hobby function-count limit because the former global tracing rule included model weights in every route. Tracing now includes both models in the eight routes that execute diagnosis; metrics, weather scheduling, history, and highlight-only comparisons do not ship model weights. A post-build packaging check verifies all eight diagnosis traces and rejects accidental model inclusion in other routes. Local build and TypeScript checks pass with this configuration.

## Signed-in production verification — 2026-10-09

Deployment `13af76d` reached Ready in Production. The first demo account was used through the normal secure browser sign-in flow, then two fresh reports were submitted through the live upload form:

| Photo | Live result | Attribution | Report |
| --- | --- | --- | --- |
| Maize with insect damage | Fall Armyworm, model score 90.51% | DaViT-Base diagnosis; Gemini image review and care | `UEtfdYRJNOSb6UA7tkZ1` |
| Corn rust leaf | Common Rust, model score 90.19% | YOLO11m diagnosis; Gemini image review and care | `GNKJtIOuPsMTzn9c1GAJ` |

Both saved reports rendered treatment information and image highlights. The maize-ear fallback reported by the user (`PwKxx7p6bKonLlhsCGIe`) recorded YOLO processing in 3.12s and DaViT in 5.87s. Its matching Vercel invocation completed successfully, without a model-unavailable warning. The fallback is not evidence that every inference or the deployed runtimes fail. It is also not valid to call these two successful examples an accuracy study or proof of universal crop coverage.

The UI previously hid the stored DaViT scores on fallback reports and displayed only a generic explanation. It now shows each model's completion/unsupported/unavailable state and raw candidates in the expandable details, including all three DaViT scores. Low-score explanations name the exact failed checks and retain the 80% acceptance threshold. Historical reports use their stored evidence, without rerunning or overwriting diagnoses. Rejected raw candidates remain clearly separated from the final diagnosis. The diagnosis-details label now says Model score for either accepted specialized model, and Gemini estimate for fallback output.

Live supplier Call buttons measured 40px in height. TypeScript and 19 focused model/attribution tests passed before deployment of this explanation fix. No confidence threshold was lowered, no third model was added, and no existing user report was deleted.
