/**
 * Webhook utilities for external integrations
 * Exposes clean interfaces for webhook handlers without exposing internal implementation
 */

export { submitImportedActivityArtifact } from "./application/activity-file-ingestion/submit-imported-activity-artifact";
export {
  createAthletePerformanceModelReader,
  createAthletePerformanceTargetFactsReader,
} from "./application/performance-model/get-athlete-performance-model-as-of";
export { createProviderSyncRepository, createWahooRepository } from "./infrastructure/repositories";
export {
  createActivityImporter,
  createWahooImportActivityFileStorage,
} from "./lib/integrations/wahoo/activity-importer";
export type { WahooWorkoutSummary } from "./lib/integrations/wahoo/client";
export { createWahooRouteStorage, WahooSyncService } from "./lib/integrations/wahoo/sync-service";
export {
  getProcessProviderSyncLimiter,
  ProviderSyncConcurrencyLimiter,
} from "./lib/provider-sync/job-execution";
export { WahooActivityHistoryJobService } from "./lib/provider-sync/wahoo-activity-history-job-service";
export { WahooSyncJobService } from "./lib/provider-sync/wahoo-job-service";
export { createWahooStagingCleanupReservation } from "./lib/provider-sync/wahoo-staging-cleanup";
export { WahooWebhookJobService } from "./lib/provider-sync/wahoo-webhook-job-service";
export { createAthletePerformanceModelRepository } from "./repositories";
