import { formatDuration } from "@repo/core";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export interface NotificationMetrics {
  elapsedInStep: number;
  heartRate?: number;
  power?: number;
}

export class NotificationsManager {
  private notificationId: string | null = null;

  constructor(private title: string) {}

  /** Initialize and show foreground notification (Android only) */
  async startForegroundService() {
    if (Platform.OS !== "android") return;

    await Notifications.setNotificationChannelAsync("activity-recording", {
      name: "Activity Recording",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0],
    });

    this.notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Recording Activity",
        body: this.title,
        categoryIdentifier: "activity",
        data: { type: "activity-recording" },
      },
      trigger: null,
    });
  }

  /** Update notification with live metrics */
  async update(metrics: NotificationMetrics) {
    if (!this.notificationId || Platform.OS !== "android") return;

    let body = `⏱️ ${formatDuration(metrics.elapsedInStep)}`;
    if (metrics.heartRate) body += ` | ❤️ ${Math.round(metrics.heartRate)} bpm`;
    if (metrics.power) body += ` | ⚡ ${Math.round(metrics.power)}W`;

    await Notifications.dismissNotificationAsync(this.notificationId);
    this.notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Recording Activity",
        body,
        categoryIdentifier: "activity",
        data: { type: "activity-recording" },
      },
      trigger: null,
    });
  }

  /** Stop foreground notification */
  async stopForegroundService() {
    if (this.notificationId) {
      await Notifications.dismissNotificationAsync(this.notificationId);
      this.notificationId = null;
    }
  }
}
