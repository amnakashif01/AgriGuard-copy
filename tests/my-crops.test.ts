import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, nameId, validateName, plantCode, severityTone } from '../src/lib/my-crops/models';
import { findPreviousReport } from '../src/lib/report-utils';
import type { DiagnosisReport } from '../src/lib/models';

test('plant names cannot evade uniqueness through casing, spacing or Unicode width', async () => {
  assert.equal(cleanName('  Plant   A  '), 'Plant A');
  assert.equal(await nameId('Plant A'), await nameId('  plant   a '));
  assert.equal(await nameId('Ｐｌａｎｔ A'), await nameId('plant a'));
  assert.match(await nameId('گندم / ایک'), /^[a-f0-9]{64}$/);
  assert.throws(() => validateName('   ', 'plant'), /enter/);
  assert.throws(() => validateName('a'.repeat(65), 'crop'), /64/);
  assert.equal(plantCode('Wheat', 2), 'WH-002');
  assert.equal(plantCode('گندم', 1), 'PL-001');
  assert.equal(severityTone(null), 'bg-slate-300');
  assert.equal(severityTone(0), 'bg-emerald-500');
});

test('report comparison stays within the same plant and retains legacy report behavior', () => {
  const report = { id: 'current', uid: 'owner', crop: 'Wheat', cropId: 'wheat', plantId: 'a', status: 'Complete', createdAt: '2026-10-07T12:00:00Z' } as DiagnosisReport;
  const correct = { ...report, id: 'older-a', createdAt: '2026-10-05T12:00:00Z' };
  const different = { ...report, id: 'newer-b', plantId: 'b', createdAt: '2026-10-06T12:00:00Z' };
  assert.equal(findPreviousReport([different, correct], report)?.id, correct.id);
  assert.equal(findPreviousReport([different], report), null);
  assert.equal(findPreviousReport([{ ...correct, plantId: undefined, cropId: undefined }], { ...report, plantId: undefined, cropId: undefined })?.id, correct.id);
});
