// Re-export relations if you need them
import { localNotifications } from "./notifications";

export type SelectLocalActivity = typeof localActivities.$inferSelect;
export type InsertLocalActivity = typeof localActivities.$inferInsert;

export type SelectLocalNotification = typeof localNotifications.$inferSelect;
export type InsertLocalNotification = typeof localNotifications.$inferInsert;

// Re-export schema tables for type inference
export { localActivities, localNotifications };
