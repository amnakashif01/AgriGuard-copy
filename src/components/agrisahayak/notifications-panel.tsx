"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, X, Check, AlertTriangle, Cloud, DollarSign, Shield, Info, ClipboardCheck, ArrowRight } from "lucide-react";
import Link from "next/link";
import { 
  subscribeUserNotifications,
  markNotificationAsRead, 
  markAllNotificationsAsRead,
  NotificationType,
  NotificationData 
} from "@/lib/notifications";
import { useAuth } from "@/firebase";
import LoadingSpinner from "./loading-spinner";

export default function NotificationsPanel() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const unreadCount = notifications.filter(notification => !notification.read).length;

  useEffect(() => {
    setNotifications([]);
    setError(null);
    if (!user?.uid) { setLoading(false); return; }
    setLoading(true);
    return subscribeUserNotifications(user.uid, items => {
      setNotifications(items);
      setLoading(false);
    }, error => {
      console.error('Notification subscription failed:', error);
      setError('Notifications could not connect. Please retry.');
      setLoading(false);
    }, 50);
  }, [user?.uid, refreshKey]);

  const handleMarkAsRead = async (notificationId: string) => {
    const notification = notifications.find(item => item.id === notificationId);
    if (!user || !notification || notification.read) return;
    try {
      await markNotificationAsRead(user.uid, notification);
    } catch (error) {
      console.error('Could not mark notification as read:', error);
      setError('Could not save read status. Please retry.');
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    try {
      await markAllNotificationsAsRead(user.uid, notifications);
    } catch (error) {
      console.error('Could not mark notifications as read:', error);
      setError('Could not save read status. Please retry.');
    }
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case NotificationType.WEATHER_ALERT:
        return <Cloud className="h-4 w-4 text-blue-500" />;
      case NotificationType.DISEASE_WARNING:
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case NotificationType.TREATMENT_REMINDER:
        return <Shield className="h-4 w-4 text-green-500" />;
      case NotificationType.MARKET_UPDATE:
        return <DollarSign className="h-4 w-4 text-yellow-500" />;
      case NotificationType.DIAGNOSIS_COMPLETE:
        return <ClipboardCheck className="h-4 w-4 text-emerald-600" />;
      case NotificationType.SYSTEM_UPDATE:
        return <Info className="h-4 w-4 text-gray-500" />;
      default:
        return <Bell className="h-4 w-4 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'normal':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'low':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <Card className="shadow-lg border-0 bg-gradient-to-br from-white to-blue-50/30">
        <CardHeader className="pb-4">
          <CardTitle className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500/20 to-blue-500/10 rounded-xl">
              <Bell className="h-6 w-6 text-blue-600"/>
            </div>
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingSpinner message="Loading notifications..." variant="sparkle" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg border-0 bg-gradient-to-br from-white to-blue-50/30">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500/20 to-blue-500/10 rounded-xl">
              <Bell className="h-6 w-6 text-blue-600"/>
            </div>
            Notifications
            {unreadCount > 0 && (
              <Badge className="bg-red-500 text-white">
                {unreadCount}
              </Badge>
            )}
          </CardTitle>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllAsRead}
              className="hover:bg-blue-50 hover:text-blue-700"
            >
              <Check className="h-4 w-4 mr-1" />
              Mark All Read
            </Button>
          )}
        </div>
        <CardDescription className="text-base">
          Stay updated with weather alerts, disease warnings, and market updates.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4" aria-live="polite">
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error} <Button variant="ghost" size="sm" onClick={() => setRefreshKey(key => key + 1)}>Retry</Button>
        </div>}
        {notifications.length === 0 ? (
          <div className="text-center py-8">
            <div className="p-4 bg-blue-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <Bell className="h-8 w-8 text-blue-600" />
            </div>
            <p className="text-gray-600 text-lg mb-2">No notifications yet</p>
            <p className="text-gray-500 text-sm">
              You'll receive alerts about weather, diseases, and market updates here.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 rounded-lg border transition-all duration-200 hover:shadow-md ${
                  notification.read 
                    ? 'bg-gray-50 border-gray-200' 
                    : 'bg-white border-blue-200 shadow-sm'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {getNotificationIcon(notification.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h4 className={`font-semibold text-sm ${
                          notification.read ? 'text-gray-700' : 'text-gray-900'
                        }`}>
                          {notification.title}
                        </h4>
                        <p className={`text-sm mt-1 ${
                          notification.read ? 'text-gray-500' : 'text-gray-600'
                        }`}>
                          {notification.body}
                        </p>
                        {notification.data?.reportId && (
                          <Link
                            href={`/report/${notification.data.reportId}`}
                            onClick={() => handleMarkAsRead(notification.id)}
                            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"
                          >
                            View report <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge 
                          className={`text-xs px-2 py-1 ${getPriorityColor(notification.priority)}`}
                        >
                          {notification.priority}
                        </Badge>
                        
                        {!notification.read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMarkAsRead(notification.id)}
                            aria-label="Mark notification as read"
                            className="h-6 w-6 p-0 hover:bg-blue-100"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-gray-400">
                        {formatDate(notification.createdAt)}
                      </span>
                      
                      {notification.data && Object.keys(notification.data).length > 0 && (
                        <div className="flex gap-1">
                          {Object.entries(notification.data).filter(([key]) => key !== 'reportId').map(([key, value]) => (
                            <Badge key={key} variant="outline" className="text-xs">
                              {key}: {value}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
