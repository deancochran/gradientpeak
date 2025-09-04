import { appSchema, tableSchema } from "@nozbe/watermelondb";

export const mySchema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: "activities",
      columns: [
        // We'll get this from Supabase auth
        { name: "profile_id", type: "string", isIndexed: true },
        { name: "started_at", type: "number" },
        { name: "ended_at", type: "number", isOptional: true },
        { name: "distance", type: "number", isOptional: true },
        { name: "duration", type: "number", isOptional: true },
        // Fields for sync and file management
        { name: "sync_status", type: "string", isIndexed: true }, // 'local_only', 'syncing', 'synced', 'sync_failed'
        { name: "local_fit_file_path", type: "string", isOptional: true },
        { name: "cloud_storage_path", type: "string", isOptional: true },
        { name: "sync_error_message", type: "string", isOptional: true },
        { name: "synced_at", type: "number", isOptional: true },
      ],
    }),
    tableSchema({
      name: "location_points",
      columns: [
        { name: "activity_id", type: "string", isIndexed: true },
        { name: "latitude", type: "number" },
        { name: "longitude", type: "number" },
        { name: "altitude", type: "number", isOptional: true },
        { name: "timestamp", type: "number" },
        { name: "speed", type: "number", isOptional: true },
        { name: "accuracy", type: "number", isOptional: true },
      ],
    }),
  ],
});
