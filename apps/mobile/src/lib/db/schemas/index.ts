// Re-export relations if you need them

import { activities } from "./activities";

export type SelectActivity = typeof activities.$inferSelect;
export type InsertActivity = typeof activities.$inferInsert;

// Re-export schema tables for type inference
export { activities };
