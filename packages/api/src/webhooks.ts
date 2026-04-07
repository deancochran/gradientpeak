/**
 * Webhook utilities for external integrations
 * Exposes clean interfaces for webhook handlers without exposing internal implementation
 */

export { createWahooRepository } from "./infrastructure/repositories";
export {
  createActivityImporter,
  createWahooImportFitFileStorage,
} from "./lib/integrations/wahoo/activity-importer";
export type { WahooWorkoutSummary } from "./lib/integrations/wahoo/client";
