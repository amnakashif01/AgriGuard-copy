import React from 'react';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { comparePlantRecords, completedPlantRecords } from '../src/lib/my-crops/record-comparison';
import { PlantProgressComparison, RecordChange, PairComparisonDetails } from '../src/components/my-crops/record-comparison';
import { plantComparisonHistory, resolveComparisonPair } from '../src/lib/my-crops/comparison-history';
import type { PlantRecord } from '../src/lib/my-crops/models';

function record(id: string, day: number, score: number | null, disease = 'Early blight', overrides: Partial<PlantRecord> = {}): PlantRecord {
  return {
    id, reportId: id, cropId: 'tomato', plantId: 'plant-a', cropName: 'Tomato', age: `${day} months`,
    symptoms: '', imageThumb: '', status: 'Complete', severityScore: score, createdAt: `2026-10-${String(day).padStart(2, '0')}T12:00:00Z`,
    diagnosis: {
      crop: 'Tomato', disease, confidence: 92, affectedParts: disease === 'Healthy' ? [] : ['Leaves'],
      severity: score === 0 ? 'None' : score !== null && score <= 33 ? 'Low' : score !== null && score > 66 ? 'High' : 'Medium',
      description: `${disease} observations`, visualHighlights: [], expertReviewRequired: false,
    },
    ...overrides,
  };
}

test('tracks improving, worsening and unchanged severity as points, including zero', () => {
  const before = record('a', 1, 65), after = record('b', 2, 25);
  const improvement = comparePlantRecords(before, after);
  assert.equal(improvement.direction, 'improving');
  assert.equal(improvement.title, 'Improving');
  assert.equal(improvement.change, -40);
  assert.match(improvement.summary, /40 points lower/);
  assert.equal(improvement.diagnosisTitle, 'Issue still reported');
  assert.equal(comparePlantRecords(after, record('c', 3, 80)).direction, 'worsening');
  assert.equal(comparePlantRecords(after, record('c', 3, 25)).direction, 'unchanged');
  const healthy = record('c', 3, 0, 'Healthy');
  assert.equal(comparePlantRecords(after, healthy).currentScore, 0);
  assert.equal(comparePlantRecords(after, healthy).change, -25);
  assert.match(comparePlantRecords(after, healthy).diagnosisSummary, /does not confirm.*cured/);
  assert.equal(comparePlantRecords(healthy, record('d', 4, 20)).diagnosisTitle, 'New issue reported');
});

test('uses category fallback without inventing numeric scores or claiming unchanged health', () => {
  const before = record('a', 1, null), after = record('b', 2, 20);
  const result = comparePlantRecords(before, after);
  assert.equal(result.basis, 'category'); assert.equal(result.change, null); assert.equal(result.direction, 'improving');
  assert.match(result.summary, /exact point change is unavailable/);
  assert.equal(comparePlantRecords(before, record('b', 2, null)).title, 'Same severity category');
  for (const invalid of [NaN, Infinity, -1, 101, 30.5]) {
    assert.equal(comparePlantRecords({ ...before, severityScore: invalid }, after).basis, 'category');
  }
  const malformed = { ...before, diagnosis: { ...before.diagnosis!, severity: 'Severe' } } as unknown as PlantRecord;
  assert.equal(comparePlantRecords(malformed, after).direction, 'unavailable');
});

test('never equates a different disease label with a cured issue', () => {
  const result = comparePlantRecords(record('a', 1, 65), record('b', 2, 20, 'Bacterial spot'));
  assert.equal(result.direction, 'improving');
  assert.equal(result.diagnosisTitle, 'Reported diagnosis changed');
  assert.match(result.diagnosisSummary, /does not prove.*resolved/);
  assert.doesNotMatch(result.diagnosisSummary, /has been cured|is fixed/);
});

test('flags uncertain and contradictory diagnoses; rejects non-crop photos', () => {
  const before = record('a', 1, 60), after = record('b', 2, 20);
  for (const diagnosis of [{ ...after.diagnosis!, confidence: 40 }, { ...after.diagnosis!, expertReviewRequired: true }, { ...after.diagnosis!, disease: 'Unknown Disease' }, { ...after.diagnosis!, severity: 'High' as const }]) {
    const result = comparePlantRecords(before, { ...after, diagnosis });
    assert.equal(result.title, 'Possible improvement'); assert.ok(result.reviewReasons.length);
  }
  const contradictory = record('b', 2, 0, 'Early blight', { diagnosis: { ...after.diagnosis!, severity: 'None', affectedParts: [] } });
  assert.equal(comparePlantRecords(before, contradictory).diagnosisTitle, 'Issue still reported');
  assert.ok(comparePlantRecords(before, contradictory).reviewReasons.length);
  assert.equal(comparePlantRecords(before, record('b', 2, 0, 'Not a Crop')).direction, 'unavailable');
  assert.equal(comparePlantRecords(before, { ...after, diagnosis: undefined }).direction, 'unavailable');
});

test('keeps plant, crop, completion and capture-date boundaries', () => {
  const before = record('a', 1, 60), after = record('b', 2, 20);
  for (const patch of [{ plantId: 'plant-b' }, { cropId: 'wheat' }, { status: 'Processing' as const }, { status: 'Error' as const }, { createdAt: before.createdAt }, { createdAt: 'bad-date' }, { id: before.id }]) {
    assert.equal(comparePlantRecords(before, { ...after, ...patch }).direction, 'unavailable');
  }
  assert.equal(comparePlantRecords(after, before).direction, 'unavailable');
  const pending = record('pending', 5, null, 'Analysis in progress', { status: 'Processing' });
  const failed = record('failed', 4, null, 'Failed', { status: 'Error' });
  const otherPlant = record('other', 6, 60, 'Early blight', { plantId: 'plant-b' });
  const otherCrop = record('other-crop', 7, 60, 'Early blight', { cropId: 'wheat' });
  const retried = { ...before, completedAt: '2026-10-08T12:00:00Z' };
  const input = [pending, after, failed, otherPlant, otherCrop, retried];
  const original = [...input];
  assert.deepEqual(completedPlantRecords(input, 'tomato', 'plant-a').map(r => r.id), ['a', 'b']);
  assert.deepEqual(input, original, 'does not reorder or modify source records');
});

test('compares affected-part labels without mistaking singular or casing changes for recovery', () => {
  const before = record('a', 1, 60), after = record('b', 2, 20);
  before.diagnosis!.affectedParts = ['Leaves', 'Fruit', ' LEAVES '];
  after.diagnosis!.affectedParts = ['leaf', 'Stems'];
  const result = comparePlantRecords(before, after);
  assert.deepEqual(result.parts, { added: ['Stems'], removed: ['Fruit'], continuing: ['leaf'] });
});

test('renders a clear baseline rather than a fabricated comparison for one test', () => {
  const html = renderToStaticMarkup(<PlantProgressComparison records={[record('a', 1, 60)]} cropId="tomato" plantId="plant-a" />);
  assert.match(html, /Your first test is the baseline/);
  assert.match(html, /href="\/my-crops\/tomato\/plant-a\/new"/);
  assert.doesNotMatch(html, /Improving|Worsening|<select/);
  const empty = renderToStaticMarkup(<PlantProgressComparison records={[]} cropId="tomato" plantId="plant-a" />);
  assert.match(empty, /Complete two tests/);
});

test('defaults to the previous completed test and offers older history, report links and original observations', () => {
  const records = [record('c', 3, 25), record('a', 1, 65), record('b', 2, 50), record('d', 4, null, 'Pending', { status: 'Processing' })];
  const html = renderToStaticMarkup(<PlantProgressComparison records={records} cropId="tomato" plantId="plant-a" />);
  assert.match(html, /<option value="b" selected=""/);
  assert.match(html, /<option value="a"/);
  assert.match(html, /25 points lower/);
  assert.match(html, /40 points lower/);
  assert.match(html, /href="\/report\/b"/); assert.match(html, /href="\/report\/c"/);
  assert.match(html, /aria-valuenow="50"/); assert.match(html, /aria-valuenow="25"/);
  assert.match(html, /A newer test is not complete yet/);
  assert.doesNotMatch(html, /Selected tests comparison/, 'detailed pair is collapsed by default');
  const detail = renderToStaticMarkup(<PairComparisonDetails {...resolveComparisonPair(completedPlantRecords(records, 'tomato', 'plant-a'))!} />);
  assert.match(detail, /Early blight observations/);
  assert.doesNotMatch(html, /NaN|undefined|<option value="d"/);
  const compact = renderToStaticMarkup(<RecordChange previous={records[1]} current={records[2]} />);
  assert.match(compact, /15 points lower/);
});

test('supports healthy Urdu diagnoses without assuming an untranslated label is a cure', () => {
  const after = record('b', 2, 0, 'Healthy'); after.diagnosis!.disease = 'صحت مند';
  assert.match(comparePlantRecords(record('a', 1, 60), after).diagnosisTitle, /not detected/);
  const unknown = record('b', 2, 20, 'نامعلوم بیماری');
  assert.equal(comparePlantRecords(record('a', 1, 60), unknown).diagnosisTitle, 'Cause still needs confirmation');
});

test('shows all 4, 10 and 100 tests, each adjacent change, and first-to-latest overall progress', () => {
  for (const count of [4, 10, 100]) {
    const records = Array.from({ length: count }, (_, index) => record(`history-${index + 1}`, 1, index % 2 ? 25 : 75, 'Early blight', {
      createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    }));
    const history = plantComparisonHistory([...records].reverse(), 'tomato', 'plant-a');
    assert.equal(history.entries.length, count);
    assert.equal(history.entries[0].comparison, null);
    assert.equal(history.overall!.change, -50);
    history.entries.slice(1).forEach((entry, index) => assert.equal(entry.comparison!.change, index % 2 ? 50 : -50));
    const html = renderToStaticMarkup(<PlantProgressComparison records={records} cropId="tomato" plantId="plant-a" />);
    assert.equal((html.match(/<article /g) || []).length, count, 'no history truncation or all-pairs explosion');
    for (const r of records) assert.ok(html.includes(`href="/report/${r.reportId}"`));
    assert.match(html, /What changed across all tests/);
    assert.match(html, /overflow-x-auto/);
    assert.match(html, /aria-expanded="false"/);
  }
});

test('selects any two tests in chronological order without changing the all-tests overview', () => {
  const records = [record('one', 1, 45), record('two', 2, 75), record('three', 3, 50), record('four', 4, 25)];
  const history = plantComparisonHistory(records, 'tomato', 'plant-a');
  for (let i = 0; i < records.length; i++) for (let j = 0; j < records.length; j++) {
    if (i === j) continue;
    const pair = resolveComparisonPair(history.complete, records[i].id, records[j].id)!;
    assert.equal(pair.earlierNumber, Math.min(i, j) + 1);
    assert.equal(pair.newerNumber, Math.max(i, j) + 1);
    assert.equal(pair.comparison.change, records[Math.max(i, j)].severityScore! - records[Math.min(i, j)].severityScore!);
  }
  const pair = resolveComparisonPair(history.complete, 'two', 'four')!;
  const html = renderToStaticMarkup(<PairComparisonDetails {...pair} />);
  assert.match(html, /50 points lower/);
  assert.match(html, /href="\/report\/two"/);
  assert.match(html, /href="\/report\/four"/);
  assert.doesNotMatch(html, /href="\/report\/three"/);
  assert.equal(history.entries.length, 4);
});

test('pair selections survive new data, missing selections, same selections and baseline state', () => {
  const records = [record('one', 1, 45), record('two', 2, 75), record('three', 3, 50), record('four', 4, 25)];
  assert.equal(resolveComparisonPair([]), null);
  assert.equal(resolveComparisonPair(records.slice(0, 1)), null);
  assert.equal(resolveComparisonPair(records)!.selected.id, 'four');
  assert.equal(resolveComparisonPair(records)!.against.id, 'three');
  const next = [...records, record('five', 5, 20)];
  assert.equal(resolveComparisonPair(next)!.selected.id, 'five', 'default follows latest on realtime updates');
  assert.equal(resolveComparisonPair(next, 'two', 'four')!.selected.id, 'two', 'explicit selection is preserved');
  assert.equal(resolveComparisonPair(records, 'deleted', 'three')!.selected.id, 'four');
  assert.equal(resolveComparisonPair(records, 'one', 'one')!.against.id, 'two');
  assert.equal(resolveComparisonPair(records, 'four', 'four')!.against.id, 'three');
});

test('all-test findings normalize labels and preserve zero, missing scores and uncertain results', () => {
  const records = [record('one', 1, 75), record('two', 2, null), record('three', 3, 0, 'Healthy')];
  records[0].diagnosis!.affectedParts = [' LEAVES ', 'Fruit'];
  records[1].diagnosis!.affectedParts = ['leaf', 'Stems'];
  records[1].diagnosis!.confidence = 40;
  const history = plantComparisonHistory(records, 'tomato', 'plant-a');
  assert.deepEqual(history.parts.map(([key]) => key), ['leaf', 'fruit', 'stem']);
  assert.equal(history.entries[1].comparison!.change, null);
  assert.equal(history.entries[1].comparison!.title, 'Possible improvement');
  assert.equal(history.overall!.currentScore, 0);
  const html = renderToStaticMarkup(<PlantProgressComparison records={records} cropId="tomato" plantId="plant-a" />);
  assert.match(html, /Numeric score unavailable/);
  assert.match(html, /aria-valuenow="0"/);
  assert.match(html, /Not reported does not confirm an issue is resolved/);
  assert.doesNotMatch(html, /NaN|undefined/);
});
