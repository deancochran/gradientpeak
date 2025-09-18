// Re-export relations if you need them
import { localActivities } from "./local_activities";
import { localNotifications } from "./notifications";
import { syncQueue } from "./sync_queue";

export type SelectLocalActivity = typeof localActivities.$inferSelect;
export type InsertLocalActivity = typeof localActivities.$inferInsert;

export type SelectLocalNotification = typeof localNotifications.$inferSelect;
export type InsertLocalNotification = typeof localNotifications.$inferInsert;

export type SelectSyncQueue = typeof syncQueue.$inferSelect;
export type InsertSyncQueue = typeof syncQueue.$inferInsert;

// Re-export schema tables for type inference
export { localActivities, localNotifications, syncQueue };
