---
title: AgriGuard AgriChat
sdk: gradio
sdk_version: 5.49.1
python_version: 3.12
app_file: space_app.py
suggested_hardware: zero-a10g
---

# AgriGuard AgriChat on free ZeroGPU

This service runs the published AgriChat adapter on its pinned LLaVA-OneVision base.
It does not claim the model was trained by the application author. Crop photos
are processed in memory. The application key is supplied only in a request header.

**Deployment status: prepared, not yet GPU-tested or activated.**

Use only **ZeroGPU** hardware in an eligible **free** Hugging Face personal account.
Do not add a paid plan, prepaid credits, a billed endpoint or paid GPU hardware.
Current hosting eligibility requires verified email, an account older than 30 days,
and an available slot within the two free ZeroGPU Spaces. Check the actual account
eligibility before uploading. Creating an ordinary CPU/Docker Space is not this route.

The free quota is 300 GPU-seconds per account per reset period; API requests made
with the site's HF token share that allowance across all website visitors. It is
not 300 seconds per visitor. A target of 15 reports needs an average under 20
charged GPU-seconds each, with further headroom for failed attempts, other usage,
and the platform's admission reservation. Queue and cold-start delays are separate.
No daily throughput, latency, or uninterrupted service guarantee has been measured.
Gemini supporting calls have their own independent limits.

## Package and configure

Run `python services/agrichat/prepare_zerogpu.py /tmp/agriguard-zerogpu` in the GitHub
checkout. Upload that generated directory to the root of your own Gradio ZeroGPU Space.
The helper only copies local files and never creates or purchases cloud resources.

Add the Space secret `AGRICHAT_API_KEY` (random, at least 32 characters).
For the copied project's Vercel Preview environment set these server-only values:

| Variable | Value |
| --- | --- |
| `CROP_DIAGNOSIS_PROVIDER` | `agrichat` |
| `AGRICHAT_TRANSPORT` | `zerogpu` |
| `AGRICHAT_ENDPOINT_URL` | `https://YOUR-SPACE.hf.space/gradio_api/call/diagnose` |
| `AGRICHAT_API_KEY` | Same secret as the Space |
| `AGRICHAT_HF_TOKEN` | Your own HF account token authorized to call this Space |

Keep tokens out of the browser and source control. Never use someone else's token,
multiple accounts, fake identity or visitor-IP manipulation to evade quota limits.
The website must handle an exhausted allowance honestly; it does not silently
label a Gemini diagnosis as AgriChat, buy credits, or retry indefinitely.

The model loads once at module startup in BF16, with no NF4 quantization. Inference
runs inside `@spaces.GPU`; input checks run before acquiring a GPU. The queue is
bounded and the application request times out after 45 seconds, plus the existing
25-second maximum supporting Gemini call. These are upper request budgets, not
measured response times. There are no automatic repeat requests to consume quota.

## Activation gate: 15 real reports

For local contract checks, install `gradio==5.49.1`, `huggingface-hub==0.36.0`,
`fastapi==0.115.12`, `pydantic==2.11.5`, `Pillow==11.3.0`, and `httpx[socks]==0.28.1`
in a test environment; then run `python -m unittest discover -s tests -v` from
`services/agrichat`. These tests use a fake GPU engine and do not measure accuracy.

Before activating production, check the account's remaining GPU quota, then run
15 distinct, expert-labeled photos representative of the intended crops through
the preview. Record quota consumed, total report latency (including plans/circles),
JSON failures, disease-label correctness and lesion-box quality. Include healthy,
unknown and non-plant cases. Repeat on a later quota period to check cold starts.
Cached or mocked results do not count as 15 real model inferences.

If that test does not fit the free quota, this configuration does not meet the
requirement. Keep production on its existing provider while seeking a legitimate
community GPU grant or university-provided GPU. A grant application is not an
approved GPU allocation. Do not promise unlimited free service.

Sources checked: https://huggingface.co/docs/hub/spaces-zerogpu and
https://huggingface.co/docs/hub/spaces-api-endpoints .
