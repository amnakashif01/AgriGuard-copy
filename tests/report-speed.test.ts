import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withAiDeadline } from '../src/lib/ai-request';

test('a stalled AI call is aborted and returns a retryable timeout', async () => {
  let aborted = false;
  await assert.rejects(withAiDeadline(signal => {
    signal.addEventListener('abort', () => { aborted = true; });
    return new Promise<never>(() => {});
  }, 20), /taking longer/);
  assert.equal(aborted, true);
  assert.equal(await withAiDeadline(async () => 'ready', 1000), 'ready');
});

test('diagnosis, plans, severity and markers use one model call; rate limits fail promptly', async () => {
  process.env.GOOGLE_API_KEY = 'local-test-key';
  const originalFetch = globalThis.fetch;
  let generations = 0;
  let quota = false;
  const diagnosis = { crop: 'Tomato', disease: 'Early Blight', confidence: 91, affectedParts: ['Leaves'], severity: 'Medium', severityScore: 45, severityExplanation: 'Visible brown lesions.', description: 'Test fixture', expertReviewRequired: false, visualHighlights: [], plan: { steps: [], totalCost: 0, timeline: '1 month', preventionTips: ['Monitor'] }, protectionPlan: { duration: '1 Month', phases: [1, 2, 3, 4].map(week => ({ week, title: 'Monitor', tasks: ['Inspect leaves'] })), recommendations: ['Keep leaves dry'] } };
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /generativelanguage.googleapis.com/);
    if (String(url).includes(':generateContent')) {
      generations++;
      if (quota) return Response.json({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } }, { status: 429 });
      const body = JSON.parse(String(options?.body));
      assert.ok(body.generationConfig.responseSchema.required.includes('severityScore'));
      assert.ok(!body.generationConfig.responseSchema.properties.cropEvidence, 'Gemini must not fabricate detector provenance');
      assert.ok(!body.generationConfig.responseSchema.properties.inference, 'Gemini must not fabricate AgriChat provenance');
      return Response.json({ candidates: [{ index: 0, content: { role: 'model', parts: [{ text: JSON.stringify(diagnosis) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 } });
    }
    return Response.json({ name: 'models/gemini-3.5-flash-lite', displayName: 'Test model', inputTokenLimit: 100000, outputTokenLimit: 8000, supportedGenerationMethods: ['generateContent'] });
  };
  try {
    const { diagnoseCrop } = await import('../src/lib/actions/diagnosis-actions');
    const input = { photoDataUri: 'data:image/jpeg;base64,/9j/2Q==', symptoms: 'Brown spots', crop: 'Tomato', language: 'english' };
    const result = await diagnoseCrop(input);
    if (!result.ok) throw new Error(result.error);
    assert.equal(result.ok, true);
    assert.equal(generations, 1, 'no separate severity or automatic image-localization request');
    assert.equal(result.diagnosis.cropEvidence?.route, 'gemini_fallback');
    assert.equal(result.diagnosis.severityScore, 45);
    assert.equal(result.diagnosis.confidence, 91);
    assert.equal(result.diagnosis.protectionPlan?.phases.length, 4);
    quota = true;
    const limited = await diagnoseCrop(input);
    assert.equal(limited.ok, false);
    if (!limited.ok) assert.match(limited.error, /usage limit/);
    assert.equal(generations, 2, 'a quota error is not repeatedly retried');
  } finally { globalThis.fetch = originalFetch; }
});
