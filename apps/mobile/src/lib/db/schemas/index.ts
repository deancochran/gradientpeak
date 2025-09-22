// Re-export relations if you need them

import { activities, activityStreams } from "./activities";

export type SelectActivity = typeof activities.$inferSelect;
export type InsertActivity = typeof activities.$inferInsert;
export type SelectActivityStream = typeof activityStreams.$inferSelect;
export type InsertActivityStream = typeof activityStreams.$inferInsert;

// Re-export schema tables for type inference
export { activities, activityStreams };
