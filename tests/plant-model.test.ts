import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plantModelSupportsCrop, reviewPlantModel, PLANT_MODEL_ID, PLANT_MODEL_REVISION, type PlantModelAssessment } from '../src/lib/plant-model';
import { classifyPlantImage } from '../src/ai/plant-model-cpu';

const assessment: PlantModelAssessment = { model: PLANT_MODEL_ID, revision: PLANT_MODEL_REVISION,
  runtime: 'ONNX Runtime CPU', status: 'predicted', elapsedMs: 20, note: 'test',
  predictions: [{ label: 'Tomato with Early Blight', score: 92 }, { label: 'Tomato with Late Blight', score: 6 }] };

test('unsupported crops are not assigned a forced PlantVillage prediction', async () => {
  assert.equal(plantModelSupportsCrop('Maize'), true);
  for (const crop of ['Wheat', 'Mango', 'Rice', 'Cotton', 'Chilli', 'Citrus']) {
    assert.equal(plantModelSupportsCrop(crop), false);
    const result = await classifyPlantImage('unused', crop);
    assert.equal(result.status, 'unsupported');
    assert.deepEqual(result.predictions, []);
  }
});

test('high softmax scores do not override disagreement or unsuitable images', () => {
  assert.equal(reviewPlantModel(assessment, { applicable: true, agrees: true, reason: 'Concentric lesions visible.' }).review, 'agreed');
  assert.equal(reviewPlantModel(assessment, { applicable: true, agrees: false, reason: 'Evidence differs.' }).review, 'disagreed');
  assert.equal(reviewPlantModel(assessment, { applicable: false, agrees: true, reason: 'This is a fruit, not a leaf.' }).review, 'not_applicable');
  assert.equal(reviewPlantModel(assessment).review, 'uncertain');
  assert.equal(reviewPlantModel({ ...assessment, predictions: [{label:'A',score:55},{label:'B',score:44}] }, { applicable:true, agrees:true, reason:'Similar appearance.' }).review, 'uncertain');
});

test('invalid input is recorded as unavailable and never becomes a fabricated prediction', async () => {
  const result = await classifyPlantImage('https://example.com/private.jpg', 'Tomato');
  assert.equal(result.status, 'unavailable');
  assert.equal(result.predictions.length, 0);
});
