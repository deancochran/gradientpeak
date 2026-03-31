/**
 * Webhook utilities for external integrations
 * Exposes clean interfaces for webhook handlers without exposing internal implementation
 */

export { createActivityImporter } from "./lib/integrations/wahoo/activity-importer";
export type { WahooWorkoutSummary } from "./lib/integrations/wahoo/client";
