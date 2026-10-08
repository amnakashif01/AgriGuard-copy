import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findTrackedPreviousReport as findPreviousReport, isTrackedPlantReport } from '../src/lib/report-utils';
import type { DiagnosisReport } from '../src/lib/models';

const report = (id: string, day: number, fields: Partial<DiagnosisReport> = {}) => ({
  id, crop: 'Tomato', status: 'Complete', createdAt: `2026-10-0${day}T10:00:00Z`, ...fields,
} as DiagnosisReport);

test('standalone diagnoses never compare to earlier reports, even with the same crop or field', () => {
  for (const fields of [{}, { fieldId: 'same-field' }, { cropId: 'tomato' }, { plantId: 'plant-a' }]) {
    const previous = report('previous', 1, fields);
    const current = report('current', 2, fields);
    assert.equal(isTrackedPlantReport(current), false);
    assert.equal(findPreviousReport([previous, current], current), null);
  }
  assert.equal(isTrackedPlantReport({ cropId: ' ', plantId: 'a' }), false);
  assert.equal(isTrackedPlantReport(null), false);
});

test('My Crops comparisons remain scoped to the same crop and plant', () => {
  const tracked = { cropId: 'tomato', plantId: 'plant-a' };
  const first = report('first', 1, tracked);
  const second = report('second', 2, tracked);
  const current = report('current', 4, tracked);
  const otherPlant = report('other-plant', 3, { cropId: 'tomato', plantId: 'plant-b' });
  const standalone = report('standalone', 3);
  assert.equal(isTrackedPlantReport(current), true);
  assert.equal(findPreviousReport([current, standalone, otherPlant, first, second], current)?.id, 'second');
  assert.equal(findPreviousReport([first], first), null);
});
