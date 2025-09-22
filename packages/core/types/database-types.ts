/**
 * Database types and schemas re-exported from supabase package
 * This ensures the core package is the single source of truth for all database types
 */

// Re-export all Zod schemas from supabase package
export {
  jsonSchema,
  publicActivitiesInsertSchema,
  publicActivitiesRowSchema,
  publicActivitiesUpdateSchema,
  publicActivityMetricDataTypeSchema,
  publicActivityMetricSchema,
  publicActivityTypeSchema,
  publicPlannedActivitiesInsertSchema,
  publicPlannedActivitiesRowSchema,
  publicPlannedActivitiesUpdateSchema,
  publicProfilesInsertSchema,
  publicProfilesRowSchema,
  publicProfilesUpdateSchema,
  publicSyncStatusSchema,
} from "@repo/supabase";

// Re-export inferred types from supabase package
export type {
  Database,
  PublicActivitiesInsert,
  PublicActivitiesRow,
  PublicActivitiesUpdate,
  PublicActivityMetric,
  PublicActivityMetricDataType,
  PublicActivityType,
  PublicPlannedActivitiesInsert,
  PublicPlannedActivitiesRow,
  PublicPlannedActivitiesUpdate,
  PublicProfilesInsert,
  PublicProfilesRow,
  PublicProfilesUpdate,
  PublicSyncStatus,
} from "@repo/supabase";
