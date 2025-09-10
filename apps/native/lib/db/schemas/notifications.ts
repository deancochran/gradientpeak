import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const local_notifications = sqliteTable("local_notifications", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  data: text("data"),
  scheduled_at: integer("scheduled_at"),
  delivered_at: integer("delivered_at"),
  read: integer("read").default(0),
});
