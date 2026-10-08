import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestAgriChat } from '../src/ai/agrichat-client';
import { readGradioResult } from '../src/ai/agrichat-zerogpu';

const fixture = {
  diagnosis: { crop: 'Tomato', disease: 'Early Blight', confidence: 81, severity: 'Medium', severityScore: 45, severityExplanation: 'Visible lesions.', affectedParts: ['Leaves'], description: 'Visible concentric lesions.', expertReviewRequired: false },
  inference: { provider: 'agrichat', model: 'boudiafA/AgriChat', revision: 'e313815109845f699eb89ed51015375ccca2e9c2', baseModel: 'llava-hf/llava-onevision-qwen2-7b-ov-hf', baseRevision: '0d50680527681998e456c7b78950205bedd8a068', quantization: 'none', confidenceType: 'model-estimate' },
};

test('free ZeroGPU uses authenticated submit/result requests and never purchases or retries on quota failure', async () => {
  const keys = ['AGRICHAT_ENDPOINT_URL', 'AGRICHAT_TRANSPORT', 'AGRICHAT_API_KEY', 'AGRICHAT_HF_TOKEN'];
  const previous = { ...process.env };
  const originalFetch = globalThis.fetch;
  process.env.AGRICHAT_ENDPOINT_URL = 'https://owner-agriguard.hf.space/gradio_api/call/diagnose';
  process.env.AGRICHAT_TRANSPORT = 'zerogpu';
  process.env.AGRICHAT_API_KEY = 'test-only-key-01234567890123456789';
  process.env.AGRICHAT_HF_TOKEN = 'hf_test_only';
  let calls = 0;
  let quota = false;
  let paymentRequired = false;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer hf_test_only');
    assert.equal(new Headers(options?.headers).get('x-agrichat-key'), process.env.AGRICHAT_API_KEY);
    assert.equal(options?.redirect, 'error');
    assert.match(String(url), /^https:\/\/owner-agriguard\.hf\.space\/gradio_api\/call\/diagnose/);
    if (options?.method === 'POST') {
      const payload = JSON.parse(String(options.body));
      assert.equal(payload.data.length, 1);
      assert.equal(payload.data[0].crop, 'Tomato');
      assert.ok(!payload.data[0].previousReport);
      if (paymentRequired) return new Response('private provider billing details', { status: 402 });
      return Response.json({ event_id: 'test_job_1' });
    }
    assert.ok(String(url).endsWith('/test_job_1'));
    const text = quota ? 'event: error\ndata: "GPU quota exceeded private-details"\n\n'
      : `event: heartbeat\ndata: null\n\nevent: complete\ndata: ${JSON.stringify([fixture])}\n\n`;
    return new Response(new ReadableStream({ start(controller) {
      for (let offset = 0; offset < text.length; offset += 7) controller.enqueue(new TextEncoder().encode(text.slice(offset, offset + 7)));
      controller.close();
    } }), { headers: { 'Content-Type': 'text/event-stream' } });
  };
  try {
    const input = { photoDataUri: 'data:image/png;base64,abcd', crop: 'Tomato', symptoms: 'Spots', previousReport: 'not sent' };
    assert.deepEqual(await requestAgriChat(input), fixture);
    assert.equal(calls, 2);
    quota = true;
    await assert.rejects(requestAgriChat(input), error => error instanceof Error && /allowance is exhausted/.test(error.message) && !error.message.includes('private-details'));
    assert.equal(calls, 4, 'no retries consume additional quota');
    paymentRequired = true;
    await assert.rejects(requestAgriChat(input), /No paid upgrade was started/);
    assert.equal(calls, 5, 'billing response is not followed by any payment or upgrade call');
    process.env.AGRICHAT_ENDPOINT_URL = 'https://unexpected.example/gradio_api/call/diagnose';
    await assert.rejects(requestAgriChat(input), /endpoint is not configured/);
    assert.equal(calls, 5, 'HF token cannot be sent to an arbitrary host');
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});

test('Gradio stream rejects missing or malformed completion and aborts a stalled reader', async () => {
  const signal = new AbortController().signal;
  for (const text of ['event: heartbeat\ndata: null\n\n', 'event: complete\ndata: broken-json\n\n', 'event: complete\ndata: []\n\n']) {
    await assert.rejects(readGradioResult(new Response(text), signal), /AgriChat/);
  }
  let cancelled = false;
  const controller = new AbortController();
  const pending = readGradioResult(new Response(new ReadableStream({ cancel() { cancelled = true; } })), controller.signal);
  controller.abort();
  await assert.rejects(pending, /abort/i);
  assert.equal(cancelled, true);
});
