import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAdminSnapshot } from '../src/lib/activity-data';
import { diagnosisNotification, mergeReportNotifications } from '../src/lib/notification-data';
import type { DiagnosisReport, AdminLog } from '../src/lib/models';

const now = new Date('2026-10-07T12:00:00Z');
const report = { id: 'report-1', uid: 'owner', crop: 'Tomato', disease: 'Early Blight', severity: 'Medium', confidence: 0, status: 'Complete', createdAt: now.toISOString(), updatedAt: now.toISOString() } as DiagnosisReport;

test('saved reports populate admin totals, chart and activity when older logs are missing', () => {
  const view = buildAdminSnapshot([report], [], 1, now);
  assert.equal(view.stats.totalReportsToday, 1);
  assert.equal(view.stats.avgConfidence, '0%');
  assert.equal(view.stats.avgResponseTime, '—');
  assert.equal(view.chartData.reduce((total, day) => total + day.reports, 0), 1);
  assert.equal(view.logs[0].reportId, report.id);
});

test('retries do not double count reports and invalid durations are excluded', () => {
  const logs = ['diagnosis_completed', 'retry_completed'].map((action, index) => ({ id: String(index), reportId: report.id, agentName: 'diagnosticAgent', action, timestamp: now.toISOString(), status: 'success', duration: index ? NaN : 2400, payload: { confidence: 90 } })) as AdminLog[];
  const view = buildAdminSnapshot(null, logs, 2, now);
  assert.equal(view.stats.totalReportsToday, 1);
  assert.equal(view.stats.avgResponseTime, '2.4s');
});

test('completed report notifications recover without duplicates and preserve read status', () => {
  const recovered = mergeReportNotifications('owner', [], [report]);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].data?.reportId, report.id);
  const stored = { ...diagnosisNotification('owner', report), read: true };
  const merged = mergeReportNotifications('owner', [stored], [report]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].read, true);
  assert.deepEqual(mergeReportNotifications('owner', [], [{ ...report, status: 'Processing' }]), []);
});
