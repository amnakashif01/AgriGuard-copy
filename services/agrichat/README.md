---
title: AgriGuard AgriChat Service
sdk: docker
app_port: 8000
---

# AgriChat diagnosis service — staged integration

**Current requirement: zero spending.** Use the free ZeroGPU route documented in
[`README.zerogpu.md`](README.zerogpu.md). The dedicated-GPU instructions below are
reference material only; do not provision paid hardware or add billing. The free
route has a separate Gradio transport and still needs an eligible user account
and a measured 15-report test before activation.

**Not activated in production. Actual GPU inference, model accuracy, Docker image
startup, and end-to-end latency are unverified until a GPU host is connected.**
The existing website defaults to Gemini until explicitly configured otherwise.

Local validation: 26 application checks and 7 service contract checks passed,
TypeScript passed, and the Next.js production build passed. The build retains
the existing nonfatal Genkit/OpenTelemetry dependency warning. GPU dependencies
were checked for package availability; downloading packages is not an inference test.

## What runs where

- Vercel keeps the existing Next.js site, Firebase integration and Gemini features.
- A separate CUDA GPU runs the real `boudiafA/AgriChat` LoRA adapter on
  `llava-hf/llava-onevision-qwen2-7b-ov-hf`. Both checkpoint revisions are pinned in
  `contract.py`; a base-only model or failed load cannot report readiness.
- AgriChat determines crop, disease, confidence estimate and visible severity.
- Gemini receives those findings and supplies care plans and lesion coordinates.
  Its support output cannot replace AgriChat's disease, confidence or severity.
  Existing Gemini localization refinements, translation, weather and other features remain.
- Reports preserve AgriChat provenance. My Crops comparisons and standalone
  diagnosis history rules are unchanged. No previous reports are sent to AgriChat.
- Model weights never download to a visitor's phone.

This integrates an existing published model; it does not fine-tune it. Confidence
is a model estimate, not measured accuracy. Neither this model nor its published
benchmark establishes accuracy on all Pakistani crops or unseen diseases.

## GPU deployment

Start with one CUDA GPU with **24 GB VRAM**, enough CPU RAM for loading shards,
and at least 40 GB free disk/cache. This is a starting configuration to test, not
a measured capacity guarantee. Use one resident worker per GPU. Keep it warm to
avoid loading weights on each diagnosis. Do not deploy this GPU container as an
ordinary CPU-only Vercel function. Hosting and any paid hardware need an approved
account; no hardware is provisioned by this repository.

On a GPU container host with NVIDIA Container Toolkit:

```bash
docker build -t agriguard-agrichat services/agrichat
# Set a randomly generated AGRICHAT_API_KEY (32+ characters) in the host secret
# manager first. Supply the same key to Vercel; never paste it into source code.
docker run --gpus all --env AGRICHAT_API_KEY \
  --mount source=agrichat-model-cache,target=/data \
  -p 127.0.0.1:8000:8000 agriguard-agrichat
```

Put the service behind the host's HTTPS ingress. Mount a persistent, writable
cache at `/data` for UID 1000. Initial checkpoint download/loading can take
minutes. `/health/ready` requires `Authorization: Bearer <AGRICHAT_API_KEY>` and
only becomes available after model load and warmup. Do not log request bodies or
authorization headers at the ingress. Do not expose the bearer key to clients.

For a Hugging Face Docker Space, copy this directory's application files,
Dockerfile, requirements and README to the Space root, select approved GPU
hardware, and add `AGRICHAT_API_KEY` as a Space secret. The app port is 8000.
The API itself requires authentication; a private Space additionally needs its
platform authentication configured at the caller/ingress before it will work.
An externally reachable Space with app-level bearer protection avoids confusing
the Hugging Face platform token with the application's API key.

## Stage on the copied Vercel project

Use **`amnakashif01/AgriGuard-copy`**, Vercel **`agri-guard-copy`**, team
**`amna-kashifs-projects-8388fec6`**. The unrelated connected Vercel account must
not be used. Do not modify the original `AgriGuard` repository or deployment.

Set these as **server-only Preview environment variables** for the feature branch:

| Variable | Value |
| --- | --- |
| `CROP_DIAGNOSIS_PROVIDER` | `agrichat` |
| `AGRICHAT_ENDPOINT_URL` | GPU host HTTPS URL ending in `/v1/diagnose` |
| `AGRICHAT_API_KEY` | Secret matching the GPU service |

Keep existing Gemini keys and Firebase configuration. Never prefix these new
variables with `NEXT_PUBLIC_`. Redeploy the preview after setting variables.
If the endpoint fails, the app returns a retryable error; it never quietly
substitutes Gemini disease inference while claiming AgriChat ran.

## Checks before activation

Local integration/contract checks (HTTP tests use a clearly labeled fake engine,
and the TypeScript tests mock providers; these are not disease-accuracy tests):

```bash
node --import tsx --test tests/agrichat.test.ts tests/report-speed.test.ts \
  tests/report-quality.test.ts tests/standalone-diagnosis.test.ts \
  tests/my-crops.test.ts tests/record-comparison.test.tsx tests/record-summary.test.tsx
npm run typecheck
# In services/agrichat, with the small test dependencies installed:
python -m pip install fastapi==0.115.12 pydantic==2.11.5 Pillow==12.1.0 httpx==0.28.1
python -m unittest discover -s tests -p test_service.py -v
```

Then test the **real GPU endpoint** with unseen, expert-labeled photographs from
each intended crop, including healthy plants, unclear symptoms and non-plant images.
Use identical photos to compare against the current Gemini baseline. Check exact
disease labels, incorrect healthy results, uncertainty handling, severity consistency,
and repeatability; manually review disagreements. Do not claim an accuracy percentage
from a handful of examples or compare confidence scores as accuracy.

Create a local JSON manifest with entries such as:

```json
[{"image":"held-out-tomato.jpg","crop":"Tomato","symptoms":"Brown lesions",
  "expectedDisease":["Early Blight","Alternaria early blight"]}]
```

Set endpoint/key securely in your terminal environment, then:

```bash
python verify_endpoint.py /path/to/real-labeled-manifest.json
```

Measure several cold and warm requests and concurrent users. The service avoids a
long queue by returning 503 while busy. One generated response is capped at 512
tokens with a 25-second generation budget; the app aborts the service request at
35 seconds and gives the separate Gemini support request up to 25 seconds. These
are timeout limits, **not a promised response speed**. Structured JSON compliance
and requested-language quality must be validated on the actual model. Invalid or
truncated responses fail visibly; no fields are filled in with invented findings.

Finally check the preview on phone/laptop: new diagnosis and saved report, Urdu,
red circles against actual lesions, care plans, retry/edit, My Crops new test and
comparisons, then unrelated Gemini features. Ensure saved AgriChat provenance
matches the server revisions. Only after these pass, set the same server variables
in Production and deploy the copied project. Roll back by setting
`CROP_DIAGNOSIS_PROVIDER=gemini` and redeploying; existing reports retain their source.

## Upstream references

- https://github.com/boudiafA/AgriChat
- https://huggingface.co/boudiafA/AgriChat
- https://huggingface.co/llava-hf/llava-onevision-qwen2-7b-ov-hf
- https://huggingface.co/docs/transformers/v4.51.3/model_doc/llava_onevision
- https://huggingface.co/docs/hub/spaces-gpus

Review the model/base licenses before distribution. Weights are fetched from their
original repositories at runtime and are not committed here.
