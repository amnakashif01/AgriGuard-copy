import { getMessaging, getToken, onMessage, MessagePayload, Messaging } from 'firebase/messaging';
import { doc, setDoc, collection, query, getDocs, orderBy, limit, onSnapshot, writeBatch } from 'firebase/firestore';
import { getDb, getApp } from './firestore';

// Get Firebase instances
const app = getApp();
const db = getDb();

// Lazy initialize messaging only when needed and supported
let messaging: Messaging | null = null;

function getMessagingInstance(): Messaging | null {
  if (typeof window === 'undefined') {
    return null; // Server-side
  }
  
  // Check if browser supports messaging
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    console.warn('Firebase Messaging not supported in this browser');
    return null;
  }
  
  // Check if running on HTTPS (required for FCM)
  if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
    console.warn('Firebase Messaging requires HTTPS');
    return null;
  }
  
  if (!messaging) {
    try {
      messaging = getMessaging(app);
    } catch (error) {
      console.warn('Failed to initialize Firebase Messaging:', error);
      return null;
    }
  }
  
  return messaging;
}

import { NotificationType, type NotificationData, mergeReportNotifications } from './notification-data';
import { activityDate } from './activity-data';
import type { DiagnosisReport } from './models';
export { NotificationType, type NotificationData } from './notification-data';

// VAPID key for push notifications
const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_KEY || 'your-vapid-key';

// Initialize notifications
export async function initializeNotifications(): Promise<string | null> {
  try {
    const messagingInstance = getMessagingInstance();
    if (!messagingInstance) {
      console.log('Messaging not supported in this environment');
      return null;
    }
    
    // Request permission
    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      // Get FCM token
      const token = await getToken(messagingInstance, {
        vapidKey: VAPID_KEY
      });
      
      return token;
    } else {
      console.log('Notification permission denied');
      return null;
    }
  } catch (error) {
    console.error('Error initializing notifications:', error);
    return null;
  }
}

// Save FCM token to user profile
export async function saveFCMToken(userId: string, token: string): Promise<void> {
  try {
    await setDoc(doc(db, 'users', userId, 'settings', 'messaging'), {
      fcmToken: token,
      lastTokenUpdate: new Date()
    }, { merge: true });
  } catch (error) {
    console.error('Error saving FCM token:', error);
  }
}

// Send notification to user
export async function sendNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, string>,
  priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal',
  scheduledFor?: Date,
  notificationId?: string
): Promise<void> {
  try {
    const notification: any = {
      id: notificationId || `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      type,
      title,
      body,
      read: false,
      createdAt: new Date(),
      priority
    };
    if (data) notification.data = data;
    if (scheduledFor) notification.scheduledFor = scheduledFor;
    
    // Save to Firestore
    await setDoc(doc(db, 'users', userId, 'notifications', notification.id), notification);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('notificationCreated'));
    }
    
    // Send push notification if user is online
    await sendPushNotification(userId, title, body, data);
    
  } catch (error) {
    console.error('Error sending notification:', error);
    throw error;
  }
}

// Send push notification via FCM
async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  try {
    // In production, this would be done via Cloud Functions
    // For now, we'll just log it
    // In-app delivery uses Firestore listeners. Background push requires a server FCM sender.
    
    // You would typically call a Cloud Function here:
    // await fetch('/api/send-notification', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ userId, title, body, data })
    // });
    
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}

function notificationQuery(userId: string, limitCount: number) {
  if (!userId) throw new Error('Sign in to load notifications.');
  return query(collection(db, 'users', userId, 'notifications'), orderBy('createdAt', 'desc'), limit(limitCount));
}

function notificationFromDocument(id: string, data: Record<string, any>): NotificationData {
  return { ...data, id, createdAt: activityDate(data.createdAt), ...(data.scheduledFor ? { scheduledFor: activityDate(data.scheduledFor) } : {}) } as NotificationData;
}

export async function getUserNotifications(userId: string, limitCount = 50): Promise<NotificationData[]> {
  const snapshot = await getDocs(notificationQuery(userId, limitCount));
  return snapshot.docs.map(doc => notificationFromDocument(doc.id, doc.data()));
}

export function subscribeUserNotifications(
  userId: string,
  onUpdate: (notifications: NotificationData[]) => void,
  onError: (error: Error) => void,
  limitCount = 50,
): () => void {
  let stored: NotificationData[] = [];
  let reports: DiagnosisReport[] = [];
  const emit = () => onUpdate(mergeReportNotifications(userId, stored, reports, limitCount));
  const stopNotifications = onSnapshot(notificationQuery(userId, limitCount), snapshot => {
    stored = snapshot.docs.map(doc => notificationFromDocument(doc.id, doc.data()));
    emit();
  }, onError);
  const stopReports = onSnapshot(query(collection(db, 'users', userId, 'reports'), orderBy('createdAt', 'desc'), limit(limitCount)), snapshot => {
    reports = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as DiagnosisReport);
    emit();
  }, onError);
  return () => { stopNotifications(); stopReports(); };
}

export async function markNotificationAsRead(userId: string, notification: NotificationData): Promise<void> {
  // Persist the complete recovered alert too, so its read state survives reloads/devices.
  await setDoc(doc(db, 'users', userId, 'notifications', notification.id), { ...notification, userId, read: true }, { merge: true });
}

export async function markAllNotificationsAsRead(userId: string, notifications?: NotificationData[]): Promise<void> {
  const items = notifications || await getUserNotifications(userId);
  const batch = writeBatch(db);
  for (const notification of items.filter(item => !item.read)) {
    batch.set(doc(db, 'users', userId, 'notifications', notification.id), { ...notification, userId, read: true }, { merge: true });
  }
  await batch.commit();
}

// Set up message listener
export function setupMessageListener(): void {
  try {
    const messagingInstance = getMessagingInstance();
    if (!messagingInstance) {
      console.log('Message listener not available - messaging not supported');
      return;
    }
    
    onMessage(messagingInstance, (payload: MessagePayload) => {
      console.log('Message received:', payload);
      
      // Show notification
      if (payload.notification) {
        const { title, body } = payload.notification;
        
        // Create browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(title || 'AgriSahayak', {
            body: body || '',
            icon: '/icon-192x192.png',
            badge: '/badge-72x72.png',
            tag: 'agrisahayak-notification'
          });
        }
      }
    });
  } catch (error) {
    console.error('Error setting up message listener:', error);
  }
}

// Weather alert notification
export async function sendWeatherAlert(
  userId: string,
  location: string,
  alert: string,
  severity: 'low' | 'medium' | 'high'
): Promise<void> {
  const priority = severity === 'high' ? 'urgent' : severity === 'medium' ? 'high' : 'normal';
  
  await sendNotification(
    userId,
    NotificationType.WEATHER_ALERT,
    `Weather Alert for ${location}`,
    alert,
    { location, severity },
    priority
  );
}

// Disease warning notification
export async function sendDiseaseWarning(
  userId: string,
  crop: string,
  disease: string,
  location: string
): Promise<void> {
  await sendNotification(
    userId,
    NotificationType.DISEASE_WARNING,
    `Disease Alert: ${disease}`,
    `${disease} detected in ${crop} crops near ${location}. Take immediate action.`,
    { crop, disease, location },
    'high'
  );
}

export async function sendDiagnosisComplete(
  userId: string,
  reportId: string,
  crop: string,
  disease: string,
  severity: string,
  confidence: number
): Promise<void> {
  const isNotCrop = /not a crop|not a plant/i.test(disease);
  const isHealthy = /healthy/i.test(disease) || severity === 'None';
  const title = isNotCrop
    ? 'Image analysis complete'
    : isHealthy
      ? `Healthy crop report ready: ${crop}`
      : `Diagnosis ready: ${disease}`;
  const body = isNotCrop
    ? 'The uploaded image was not identified as a crop. Open the report to review the result.'
    : `${crop}: ${disease}. Severity: ${severity}. Confidence: ${confidence}%. Open the report for details.`;
  const priority = severity === 'High' ? 'high' : 'normal';

  await sendNotification(
    userId,
    NotificationType.DIAGNOSIS_COMPLETE,
    title,
    body,
    { reportId, crop, disease, severity, confidence: String(confidence) },
    priority,
    undefined,
    `diagnosis_${reportId}`
  );
}

// Treatment reminder notification
export async function sendTreatmentReminder(
  userId: string,
  treatment: string,
  dueDate: Date
): Promise<void> {
  await sendNotification(
    userId,
    NotificationType.TREATMENT_REMINDER,
    'Treatment Reminder',
    `Don't forget: ${treatment}`,
    { treatment },
    'normal',
    dueDate
  );
}

// Market update notification
export async function sendMarketUpdate(
  userId: string,
  crop: string,
  price: string,
  trend: 'up' | 'down' | 'stable'
): Promise<void> {
  const emoji = trend === 'up' ? '📈' : trend === 'down' ? '📉' : '➡️';
  
  await sendNotification(
    userId,
    NotificationType.MARKET_UPDATE,
    `${emoji} Market Update: ${crop}`,
    `Current price: ${price} (${trend})`,
    { crop, price, trend },
    'normal'
  );
}

// System update notification
export async function sendSystemUpdate(
  userId: string,
  title: string,
  message: string
): Promise<void> {
  await sendNotification(
    userId,
    NotificationType.SYSTEM_UPDATE,
    title,
    message,
    {},
    'low'
  );
}

// Check if notifications are supported
export function isNotificationSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

// Get notification permission status
export function getNotificationPermission(): NotificationPermission | null {
  if ('Notification' in window) {
    return Notification.permission;
  }
  return null;
}
