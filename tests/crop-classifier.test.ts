import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSIFIER_REVISION, type ClassifierResult } from '../src/lib/crop-classifier';
import { chooseClassifierEvidence, chooseDetectorEvidence, CropEvidenceSchema, DETECTOR_REVISION, type DetectorResult } from '../src/lib/crop-detector';
import { resolveDetectorDiagnosis } from '../src/ai/detector-diagnosis';
import { classifyCropCondition } from '../src/ai/crop-classifier-cpu';
import { needsHighlightReview } from '../src/lib/report-utils';
import { createHash } from 'node:crypto';
import { classifierBicubicResize } from '../src/ai/classifier-resize';

const empty: DetectorResult = { model: 'YOLO11m PlantDoc', revision: DETECTOR_REVISION, status: 'detected', elapsedMs: 100, detections: [] };
const leaf: DetectorResult = { ...empty, detections: [{ classId: 9, label: 'Corn rust leaf', score: 91, box: [0, 0, 800, 800] }] };
const candidate = (): ClassifierResult => ({ model: 'DaViT-Base', revision: CLASSIFIER_REVISION, status: 'classified', elapsedMs: 400,
  prediction: { crop: { label: 'maize', score: 90.5 }, category: { label: 'pest/weed', score: 92.46 }, condition: { label: 'fall armyworm', score: 90.67 }, cropMasked: false } });
const base = chooseDetectorEvidence(empty);
const input = { photoDataUri: 'fixture', crop: 'Maize', symptoms: 'Insect damage' };
const report = { crop: 'Maize', disease: 'Independent assessment', confidence: 75, affectedParts: ['Leaves'], severity: 'Medium' as const, severityScore: 45, description: 'Visible damage', visualHighlights: [], expertReviewRequired: true };
const support = { ...report, review: { applicable: true, agrees: true, reason: 'Visible crop and insect damage match.' } };

test('bicubic preprocessing matches independent Pillow reference pixels for up/down/unchanged axes', () => {
  const input = Uint8Array.from({ length: 8 * 9 * 3 }, (_, i) => (i * 37 + 11) % 256);
  for (const [w, h, expected] of [
    [4, 5, '62eae0411ff8f0cb50d68dc72a246aa4f30b72e04f15455e06b4dd2091a3139e'],
    [16, 18, '4f1116b770335092bdb88e2d8809a4c94e7a05075552797e9fe2feaea9a74470'],
    [8, 9, '2332d720006ef3b95e78302d8e203faabc409508154f38cfc7cac367e8c94270'],
    [8, 5, '0be6d72d7830af4c9fcffc50ebb01dc84c745ffdf2179524687a2b391f5f7494'],
    [4, 9, '2a6eef85686a74da807f75f02d115af402afd01f385fe8b3524aab2e3b8bebac'],
  ] as const) assert.equal(createHash('sha256').update(classifierBicubicResize(input, 8, 9, w, h)).digest('hex'), expected);
});

test('DaViT crop/category/condition all need a strong score; a masked high score cannot hide uncertainty', () => {
  const evidence = chooseClassifierEvidence(base, candidate(), 'corn');
  assert.equal(evidence.accepted?.disease, 'Fall Armyworm');
  assert.equal(evidence.accepted?.score, 90.5);
  assert.equal(evidence.accepted?.model, 'DaViT-Base');
  assert.equal(evidence.version, 3);
  assert.ok(CropEvidenceSchema.safeParse(evidence).success);
  for (const head of ['crop', 'category', 'condition'] as const) {
    const value = candidate(); value.prediction![head].score = 79.9;
    assert.equal(chooseClassifierEvidence(base, value, 'Maize').accepted, undefined, head);
  }
  const tomato = candidate();
  tomato.prediction = { crop: { label: 'tomato', score: 67.27 }, category: { label: 'disease', score: 66.53 }, condition: { label: 'blossom end rot', score: 82.84 }, cropMasked: true };
  assert.equal(chooseClassifierEvidence(base, tomato, 'Tomato').route, 'gemini_fallback');
});

test('wrong crop, generic category and healthy/condition conflict abstain', () => {
  assert.equal(chooseClassifierEvidence(base, candidate(), 'Tomato').accepted, undefined);
  for (const label of ['other', 'unknown', 'broadleaf plant']) {
    const value = candidate(); value.prediction!.crop.label = label;
    assert.equal(chooseClassifierEvidence(base, value).accepted, undefined);
  }
  const unhealthy = candidate(); unhealthy.prediction!.condition.label = 'healthy';
  assert.equal(chooseClassifierEvidence(base, unhealthy).accepted, undefined);
});

test('strong existing YOLO result wins and skips the additional model', async () => {
  const result = await resolveDetectorDiagnosis(input, {
    detect: async () => leaf, support: async () => support,
    classify: async () => { throw new Error('Should not run DaViT'); },
    fallback: async () => { throw new Error('Should not run fallback'); },
  });
  assert.equal(result.disease, 'Common Rust'); assert.equal(result.confidence, 91);
});

test('picker synonyms match the classifier crop while unrelated crops still abstain', () => {
  const value = candidate(); value.prediction!.crop.label = 'chili pepper';
  assert.equal(chooseClassifierEvidence(base, value, 'Chilli').accepted?.crop, 'Chilli');
  assert.equal(chooseClassifierEvidence(base, value, 'Bell Pepper').accepted, undefined);
  value.prediction!.crop.label = 'mandarin orange';
  assert.equal(chooseClassifierEvidence(base, value, 'Citrus').route, 'model_assisted');
  assert.equal(chooseClassifierEvidence(base, value, 'Mango').accepted, undefined);
});

test('DaViT supplies identity while Gemini supplies verified severity and care', async () => {
  const result = await resolveDetectorDiagnosis(input, {
    detect: async () => empty, classify: async () => candidate(), support: async () => support,
    fallback: async () => { throw new Error('Unexpected fallback'); },
  });
  assert.equal(result.disease, 'Fall Armyworm'); assert.equal(result.confidence, 90.5);
  assert.equal(result.severityScore, 45); assert.equal(result.cropEvidence?.accepted?.model, 'DaViT-Base');
  assert.equal(needsHighlightReview({ ...result, status: 'Complete', imageThumb: 'fixture' }), false);
});

test('a rejected YOLO candidate can be recovered by DaViT after independent review', async () => {
  let reviews = 0;
  const result = await resolveDetectorDiagnosis(input, {
    detect: async () => leaf, classify: async () => candidate(),
    support: async evidence => { reviews++; return { ...support, review: { applicable: true, agrees: evidence.accepted?.model === 'DaViT-Base', reason: 'Insect damage rather than rust.' } }; },
    fallback: async () => { throw new Error('Unexpected fallback'); },
  });
  assert.equal(reviews, 2); assert.equal(result.disease, 'Fall Armyworm');
});

test('rejected or unavailable DaViT never masquerades as the final diagnosis', async () => {
  for (const classification of [candidate(), { model: 'DaViT-Base', revision: CLASSIFIER_REVISION, status: 'unavailable', elapsedMs: 0 } as ClassifierResult]) {
    const result = await resolveDetectorDiagnosis(input, { detect: async () => empty, classify: async () => classification,
      support: async () => ({ ...support, review: { applicable: false, agrees: false, reason: 'Not supported by visible image.' } }), fallback: async () => report });
    assert.equal(result.disease, report.disease); assert.equal(result.cropEvidence?.accepted, undefined);
    assert.equal(result.cropEvidence?.route, 'gemini_fallback');
  }
  assert.equal((await classifyCropCondition('invalid-image')).status, 'unavailable');
});

test('healthy DaViT report cannot retain disease treatment or circles from support', async () => {
  const healthy = candidate(); healthy.prediction!.category.label = 'healthy'; healthy.prediction!.condition.label = 'healthy';
  const result = await resolveDetectorDiagnosis(input, { detect: async () => empty, classify: async () => healthy,
    support: async () => ({ ...support, plan: { steps: [], timeline: 'Test', totalCost: 1, preventionTips: [] }, visualHighlights: [{ boundingBox: [1, 1, 3, 3], reasoning: 'Must be removed' }] }), fallback: async () => report });
  assert.equal(result.disease, 'Healthy'); assert.equal(result.severityScore, 0);
  assert.equal(result.plan, undefined); assert.deepEqual(result.visualHighlights, []);
});
