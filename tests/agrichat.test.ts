import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnosisProvider, requestAgriChat } from '../src/ai/agrichat-client';

const input = { photoDataUri: 'data:image/jpeg;base64,/9j/2Q==', symptoms: 'Brown spots', crop: 'Tomato', language: 'english' };
const diagnosis = { crop: 'Tomato', disease: 'Early Blight', confidence: 81, severity: 'Medium', severityScore: 45, severityExplanation: 'Brown lesions.', affectedParts: ['Leaves'], description: 'Concentric lesions visible on lower leaves.', expertReviewRequired: false };
const inference = { provider: 'agrichat', model: 'boudiafA/AgriChat', revision: 'e313815109845f699eb89ed51015375ccca2e9c2', baseModel: 'llava-hf/llava-onevision-qwen2-7b-ov-hf', baseRevision: '0d50680527681998e456c7b78950205bedd8a068', quantization: 'nf4', confidenceType: 'model-estimate' };
const endpoint = 'https://agrichat.example/v1/diagnose';

test('AgriChat integration: provider selection, errors, provenance and Gemini support isolation', async () => {
  const originalFetch = globalThis.fetch;
  const env = { ...process.env };
  try {
    delete process.env.CROP_DIAGNOSIS_PROVIDER;
    assert.equal(diagnosisProvider(), 'hybrid', 'local model plus Gemini review is the free default');
    process.env.CROP_DIAGNOSIS_PROVIDER = 'typo';
    assert.throws(diagnosisProvider, /not configured/);
    process.env.CROP_DIAGNOSIS_PROVIDER = 'agrichat';
    delete process.env.AGRICHAT_ENDPOINT_URL;
    await assert.rejects(requestAgriChat(input), /not configured/);
    process.env.AGRICHAT_ENDPOINT_URL = endpoint;
    process.env.AGRICHAT_API_KEY = 'test-only-token-01234567890123456789';
    process.env.GOOGLE_API_KEY = 'test-only-google-key';
    let agriCalls = 0;
    let supportCalls = 0;
    let status = 200;
    let response: unknown = { diagnosis, inference };
    globalThis.fetch = async (url, options) => {
      if (String(url) === endpoint) {
        agriCalls++;
        assert.equal(options?.redirect, 'error');
        assert.equal(options?.cache, 'no-store');
        assert.equal(new Headers(options?.headers).get('authorization'), `Bearer ${process.env.AGRICHAT_API_KEY}`);
        const sent = JSON.parse(String(options?.body));
        assert.deepEqual(sent, input);
        return Response.json(status === 200 ? response : { detail: 'sensitive-provider-error' }, { status });
      }
      assert.match(String(url), /generativelanguage.googleapis.com/);
      if (String(url).includes(':generateContent')) {
        supportCalls++;
        const request = JSON.parse(String(options?.body));
        assert.match(JSON.stringify(request.contents), /Early Blight/);
        assert.ok(!request.generationConfig.responseSchema.properties.disease);
        // Even a malformed/malicious support response cannot overwrite the primary finding.
        const support = { disease: 'Healthy', confidence: 100, severityScore: 0,
          visualHighlights: [{ boundingBox: [100, 200, 250, 300], reasoning: 'Visible lesion' }],
          plan: { steps: [], totalCost: 0, timeline: '1 month', preventionTips: ['Keep leaves dry'] },
          protectionPlan: { duration: '1 Month', phases: [1,2,3,4].map(week => ({ week, title: 'Inspect', tasks: ['Monitor'] })), recommendations: ['Seek expert confirmation'] },
        };
        return Response.json({ candidates: [{ index: 0, content: { role: 'model', parts: [{ text: JSON.stringify(support) }] }, finishReason: 'STOP' }] });
      }
      return Response.json({ name: 'models/gemini-3.5-flash-lite', inputTokenLimit: 100000, outputTokenLimit: 8000, supportedGenerationMethods: ['generateContent'] });
    };
    const { diagnoseCrop } = await import('../src/lib/actions/diagnosis-actions');
    const trackedInput = { ...input, age: '3 months', previousReport: 'must not be sent' };
    const result = await diagnoseCrop(trackedInput);
    if (!result.ok) throw new Error(result.error);
    assert.equal(result.diagnosis.disease, diagnosis.disease);
    assert.equal(result.diagnosis.confidence, diagnosis.confidence);
    assert.equal(result.diagnosis.severityScore, 45);
    assert.equal(result.diagnosis.visualHighlights.length, 1);
    assert.equal(result.diagnosis.protectionPlan?.phases.length, 4);
    assert.deepEqual(result.diagnosis.inference, inference);
    assert.equal(agriCalls, 1);
    assert.equal(supportCalls, 1);

    for (const [code, message] of [[401, /configured/], [503, /busy/], [422, /structured/], [504, /timed out/]] as const) {
      status = code;
      const failure = await diagnoseCrop(input);
      assert.equal(failure.ok, false);
      if (!failure.ok) { assert.match(failure.error, message); assert.doesNotMatch(failure.error, /sensitive/); }
    }
    assert.equal(agriCalls, 5, 'one attempt per request, no hidden repeat GPU calls');
    assert.equal(supportCalls, 1, 'no Gemini fallback when the actual model fails');
    status = 200;
    response = { diagnosis: { ...diagnosis, confidence: 101 }, inference };
    await assert.rejects(requestAgriChat(input), /invalid result/);
    response = { diagnosis, inference: { ...inference, model: 'not-agrichat' } };
    await assert.rejects(requestAgriChat(input), /invalid result/);
    response = { diagnosis: { ...diagnosis, disease: 'Healthy', severity: 'None', severityScore: 0, affectedParts: [] }, inference };
    assert.equal((await diagnoseCrop(input)).ok, true);
    assert.equal(supportCalls, 1, 'healthy result needs no extra supporting model request');
    process.env.AGRICHAT_ENDPOINT_URL = 'http://agrichat.example/v1/diagnose';
    await assert.rejects(requestAgriChat(input), /HTTPS/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of ['CROP_DIAGNOSIS_PROVIDER', 'AGRICHAT_ENDPOINT_URL', 'AGRICHAT_API_KEY', 'GOOGLE_API_KEY']) {
      if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key];
    }
  }
});
