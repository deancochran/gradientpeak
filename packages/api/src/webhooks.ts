/**
 * Webhook utilities for external integrations
 * Exposes clean interfaces for webhook handlers without exposing internal implementation
 */

export { createProviderSyncRepository, createWahooRepository } from "./infrastructure/repositories";
export {
  createActivityImporter,
  createWahooImportFitFileStorage,
} from "./lib/integrations/wahoo/activity-importer";
export type { WahooWorkoutSummary } from "./lib/integrations/wahoo/client";
export { createWahooRouteStorage, WahooSyncService } from "./lib/integrations/wahoo/sync-service";
export { WahooSyncJobService } from "./lib/provider-sync/wahoo-job-service";
export { WahooWebhookJobService } from "./lib/provider-sync/wahoo-webhook-job-service";
