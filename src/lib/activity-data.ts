import type { AdminLog, DiagnosisReport } from './models';

export function activityDate(value: unknown): Date {
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  const date = new Date(value as string | number | Date);
  return Number.isFinite(date.getTime()) ? date : new Date(0);
}

export type AdminSnapshot = {
  logs: AdminLog[];
  chartData: { date: string; reports: number }[];
  stats: { totalReportsToday: number; activeUsers: number; avgConfidence: string; avgResponseTime: string };
};

const completedAction = /^(diagnosis|retry|edit)_completed$/;

export function buildAdminSnapshot(
  reports: DiagnosisReport[] | null,
  logs: AdminLog[],
  userCount: number,
  now = new Date(),
): AdminSnapshot {
  const successful = logs.filter(log => log.status === 'success' && completedAction.test(log.action));
  const latest = new Map<string, AdminLog>();
  for (const log of successful) {
    const key = log.reportId || log.id;
    if (!latest.has(key) || activityDate(log.timestamp) > activityDate(latest.get(key)!.timestamp)) latest.set(key, log);
  }
  const completed = reports === null
    ? [...latest.values()].map(log => ({ id: log.reportId || log.id, createdAt: log.timestamp, confidence: log.payload?.confidence }))
    : reports.filter(report => report.status === 'Complete');
  const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const buckets = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now);
    day.setDate(day.getDate() - 6 + index);
    return { key: dayKey(day), date: day.toLocaleDateString('en-US', { weekday: 'short' }), reports: 0 };
  });
  const today = dayKey(now);
  let totalReportsToday = 0;
  for (const report of completed) {
    const key = dayKey(activityDate(report.createdAt));
    const bucket = buckets.find(day => day.key === key);
    if (bucket) bucket.reports++;
    if (key === today) totalReportsToday++;
  }
  const confidences = completed.map(report => report.confidence).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const durations = successful.map(log => log.duration).filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  // Saved reports remain visible even when older background log writes were denied.
  const savedReportRows: AdminLog[] = (reports || []).filter(report => !logs.some(log => log.reportId === report.id)).map(report => ({
    id: `saved_${report.id}`, reportId: report.id, agentName: 'diagnosticAgent',
    action: `saved_report_${report.status.toLowerCase()}`,
    status: report.status === 'Error' ? 'error' : report.status === 'Complete' ? 'success' : 'info',
    timestamp: report.updatedAt || report.createdAt,
  }));
  return {
    logs: [...logs, ...savedReportRows].sort((a, b) => activityDate(b.timestamp).getTime() - activityDate(a.timestamp).getTime()).slice(0, 30),
    chartData: buckets.map(({ date, reports }) => ({ date, reports })),
    stats: {
      totalReportsToday, activeUsers: userCount,
      avgConfidence: confidences.length ? `${Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)}%` : '—',
      avgResponseTime: durations.length ? `${(durations.reduce((a, b) => a + b, 0) / durations.length / 1000).toFixed(1)}s` : '—',
    },
  };
}
