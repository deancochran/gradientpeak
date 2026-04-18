/**
 * Recording Configuration System
 *
 * Defines what features are available and should be shown based on:
 * - Activity type (run, bike, etc.)
 * - Recording mode (planned vs unplanned)
 * - Connected devices (FTMS trainer, sensors)
 * - Plan structure (has steps, route, etc.)
 * - GPS intent + availability
 */

import { z } from "zod";

import type { FTMSFeatures } from "../ftms-types";
import type { ActivityPlanStructureV2 } from "./activity_plan_v2";
import type { CanonicalSport } from "./sport";

export const recordingPrimaryMetricSchema = z.enum(["time", "distance", "reps", "power"]);
export const recordingAutoFollowPrioritySchema = z.enum([
  "none",
  "plan_targets",
  "route_simulation",
]);

export const recordingCapabilitiesSchema = z
  .object({
    canTrackLocation: z.boolean(),
    canTrackPower: z.boolean(),
    canTrackHeartRate: z.boolean(),
    canTrackCadence: z.boolean(),
    shouldShowMap: z.boolean(),
    shouldShowSteps: z.boolean(),
    shouldShowRouteOverlay: z.boolean(),
    shouldShowTurnByTurn: z.boolean(),
    shouldShowFollowAlong: z.boolean(),
    shouldShowTrainerControl: z.boolean(),
    canAutoAdvanceSteps: z.boolean(),
    shouldAutoFollowTargets: z.boolean(),
    autoFollowPriority: recordingAutoFollowPrioritySchema,
    autoFollowConflict: z.boolean(),
    autoFollowConflictReason: z.string().nullable(),
    primaryMetric: recordingPrimaryMetricSchema,
    isValid: z.boolean(),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .strict();

// ============================================================================
// Configuration Input
// ============================================================================

export interface RecordingConfigInput {
  // Core activity details
  activityCategory: CanonicalSport;
  gpsRecordingEnabled: boolean;
  mode: "planned" | "unplanned";

  // Plan details (if planned)
  plan?: {
    hasStructure: boolean; // Has steps to follow
    hasRoute: boolean; // Has GPS route
    stepCount: number;
    requiresManualAdvance: boolean; // Any "untilFinished" steps
    structure?: ActivityPlanStructureV2 | null;
  };

  // Connected devices
  devices: {
    ftmsTrainer?: {
      deviceId: string;
      features?: FTMSFeatures;
      autoControlEnabled: boolean;
    };
    hasPowerMeter: boolean;
    hasHeartRateMonitor: boolean;
    hasCadenceSensor: boolean;
  };

  // Environment
  gpsAvailable: boolean;
}

// ============================================================================
// Capabilities - What the app can/should do
// ============================================================================

export interface RecordingCapabilities {
  // Data collection
  canTrackLocation: boolean;
  canTrackPower: boolean;
  canTrackHeartRate: boolean;
  canTrackCadence: boolean;

  // UI features - what to show
  shouldShowMap: boolean;
  shouldShowSteps: boolean;
  shouldShowRouteOverlay: boolean;
  shouldShowTurnByTurn: boolean;
  shouldShowFollowAlong: boolean;
  shouldShowTrainerControl: boolean; // Renamed from shouldShowPowerTarget - shows trainer control card

  // Automation - what to do automatically
  canAutoAdvanceSteps: boolean;
  shouldAutoFollowTargets: boolean; // Renamed from canAutoControlTrainer - auto-adjust trainer to follow plan/route targets
  autoFollowPriority: "none" | "plan_targets" | "route_simulation";
  autoFollowConflict: boolean;
  autoFollowConflictReason: string | null;

  // Primary metric for navigation
  primaryMetric: "time" | "distance" | "reps" | "power";

  // Validation
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Full Configuration
// ============================================================================

export interface RecordingConfiguration {
  input: RecordingConfigInput;
  capabilities: RecordingCapabilities;
}
