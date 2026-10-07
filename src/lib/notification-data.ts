import type { DiagnosisReport } from './models';
import { activityDate } from './activity-data';

// Notification types
export enum NotificationType {
  WEATHER_ALERT = 'weather_alert',
  DISEASE_WARNING = 'disease_warning',
  TREATMENT_REMINDER = 'treatment_reminder',
  MARKET_UPDATE = 'market_update',
  DIAGNOSIS_COMPLETE = 'diagnosis_complete',
  SYSTEM_UPDATE = 'system_update'
}

export interface NotificationData {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  read: boolean;
  createdAt: Date;
  scheduledFor?: Date;
  priority: 'low' | 'normal' | 'high' | 'urgent';
}

export function diagnosisNotification(userId: string, report: DiagnosisReport): NotificationData {
  const isNotCrop = /not a crop|not a plant/i.test(report.disease);
  const isHealthy = /healthy/i.test(report.disease) || report.severity === 'None';
  return {
    id: `diagnosis_${report.id}`, userId, type: NotificationType.DIAGNOSIS_COMPLETE,
    title: isNotCrop ? 'Image analysis complete' : isHealthy ? `Healthy crop report ready: ${report.crop || 'Crop'}` : `Diagnosis ready: ${report.disease}`,
    body: isNotCrop ? 'The uploaded image was not identified as a crop. Open the report to review the result.' : `${report.crop || 'Crop'}: ${report.disease}. Severity: ${report.severity}. Confidence: ${report.confidence}%. Open the report for details.`,
    data: { reportId: report.id, crop: report.crop || 'Crop', disease: report.disease, severity: report.severity, confidence: String(report.confidence) },
    read: false, createdAt: activityDate(report.updatedAt || report.createdAt),
    priority: report.severity === 'High' ? 'high' : 'normal',
  };
}

export function mergeReportNotifications(userId: string, stored: NotificationData[], reports: DiagnosisReport[], max = 50): NotificationData[] {
  // Recover alerts for completed reports whose old notification writes were denied.
  const existingReports = new Set(stored.filter(item => item.type === NotificationType.DIAGNOSIS_COMPLETE).map(item => item.data?.reportId));
  const recovered = reports.filter(report => report.status === 'Complete' && !existingReports.has(report.id)).map(report => diagnosisNotification(userId, report));
  return [...stored, ...recovered].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, max);
}
