// ===== SINGLE CONSOLIDATED ACTIVITY SYSTEM SERVICE =====

/**
 * ActivityRecorderService - The ONLY service for all activity recording operations
 *
 * This consolidated service handles:
 * - Activity lifecycle (start, pause, resume, finish, discard)
 * - GPS and sensor data collection
 * - Real-time metrics calculation
 * - Recovery and checkpoint system
 * - Data persistence (JSON files + local database)
 * - Background sync to remote services
 * - Error logging and fault tolerance
 * - Permission management
 * - State management
 */
export { ActivityRecorderService } from "./activity-recorder";

// ===== CONSOLIDATED EXPORTS =====
// Export all types and interfaces from the single service
export type {
  ActivityCheckpoint,
  ActivityJSON,
  ActivityResult,
  ActivityType,
  ConnectionStatus,
  ErrorLogEntry,
  GpsDataPoint,
  LiveMetrics,
  RecordingSession,
  RecordingState,
  SensorDataPoint,
} from "./activity-recorder";

// ===== ALL SERVICES AND STORES CONSOLIDATED =====
// The following have been merged into ActivityRecorderService:
// - ActivityService -> merged into ActivityRecorderService
// - ActivitySaveService -> merged into ActivityRecorderService
// - ActivityCompletionService -> merged into ActivityRecorderService
// - LocalActivityDatabaseService -> merged into ActivityRecorderService
// - ActivitySyncService -> merged into ActivityRecorderService
// - activity-data-store.ts -> state managed in ActivityRecorderService
// - activity-store.ts -> state managed in ActivityRecorderService

// ===== MIGRATION GUIDE =====
// OLD IMPORTS:
// import { ActivityService, ActivitySyncService } from "@/lib/services";
// import { useActivityStore } from "@/lib/stores/activity-store";
//
// NEW IMPORTS:
// import { ActivityRecorderService } from "@/lib/services";
// import { useEnhancedActivityRecording } from "@/lib/hooks/useEnhancedActivityRecording";
