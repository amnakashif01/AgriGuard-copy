import React from 'react';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecordSummary } from '../src/components/my-crops/record-summary';
import type { PlantRecord } from '../src/lib/my-crops/models';

const record = { id: 'saved', reportId: 'saved', status: 'Complete', severityScore: null } as PlantRecord;
test('a missing score has a visible report link and recovery control, with no empty meter', () => {
  const html = renderToStaticMarkup(<RecordSummary record={record} onRetrySeverity={() => {}} />);
  assert.match(html, /href="\/report\/saved"/);
  assert.match(html, /View Full Report/);
  assert.match(html, /Report ready/);
  assert.match(html, /Severity estimate unavailable/);
  assert.match(html, /Retry severity estimate/);
  assert.doesNotMatch(html, /role="meter"/);
  assert.doesNotMatch(html, /—/);
});
test('zero severity is a valid score and a pending recovery cannot be clicked twice', () => {
  const complete = renderToStaticMarkup(<RecordSummary record={{ ...record, severityScore: 0 }} />);
  assert.match(complete, /aria-valuenow="0"/);
  assert.doesNotMatch(complete, /unavailable/);
  const pending = renderToStaticMarkup(<RecordSummary record={record} busy retrying onRetrySeverity={() => {}} />);
  assert.match(pending, /Calculating severity/);
  assert.match(pending, /disabled=""/);
  assert.match(pending, /View Full Report/);
});
