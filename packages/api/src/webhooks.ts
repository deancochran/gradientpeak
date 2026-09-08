/**
 * Webhook utilities for external integrations
 * Exposes clean interfaces for webhook handlers without exposing internal implementation
 */

export { submitImportedActivityArtifact } from "./application/activity-file-ingestion/submit-imported-activity-artifact";
export { AthleteStateWorkerService } from "./application/athlete-intelligence/athlete-state-worker";
export { readPublishedAthletePerformanceTargets } from "./application/athlete-intelligence/published-athlete-state";
export { createWahooRepository, createWahooSyncRepository } from "./infrastructure/repositories";
export { createStravaRepository } from "./infrastructure/repositories/drizzle-strava-repository";
export {
  isStravaIntegrationEnabled,
  isWahooIntegrationEnabled,
} from "./lib/integrations/oauth-config";
export {
  createActivityImporter,
  createWahooImportActivityFileStorage,
} from "./lib/integrations/wahoo/activity-importer";
export type { WahooWorkoutSummary } from "./lib/integrations/wahoo/client";
export { createWahooRouteStorage, WahooSyncService } from "./lib/integrations/wahoo/sync-service";
export { StravaActivityHistoryJobService } from "./lib/provider-sync/strava-activity-history-job-service";
export { StravaCompletedActivityUploadJobService } from "./lib/provider-sync/strava-completed-activity-upload-job-service";
export { createStravaProviderRuntime } from "./lib/provider-sync/strava-provider-runtime";
export {
  createStravaWebhookDeliveryIdentity,
  parseStravaWebhookPayload,
  type StravaWebhookPayload,
} from "./lib/provider-sync/strava-webhook-contract";
export { StravaWebhookJobService } from "./lib/provider-sync/strava-webhook-job-service";
export { WahooActivityHistoryJobService } from "./lib/provider-sync/wahoo-activity-history-job-service";
export {
  getProcessWahooSyncLimiter,
  WahooSyncConcurrencyLimiter,
} from "./lib/provider-sync/wahoo-job-execution";
export { WahooSyncJobService } from "./lib/provider-sync/wahoo-job-service";
export { createWahooStagingCleanupReservation } from "./lib/provider-sync/wahoo-staging-cleanup";
export { WahooWebhookJobService } from "./lib/provider-sync/wahoo-webhook-job-service";
export { createActivityImportRepository } from "./repositories/activity-import-repository";
