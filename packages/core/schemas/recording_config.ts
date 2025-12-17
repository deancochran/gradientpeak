/**
 * Recording Configuration System
 *
 * Defines what features are available and should be shown based on:
 * - Activity type (outdoor run, indoor bike, etc.)
 * - Recording mode (planned vs unplanned)
 * - Connected devices (FTMS trainer, sensors)
 * - Plan structure (has steps, route, etc.)
 * - GPS availability
 */

import type { ActivityCategory, ActivityLocation } from "../constants";
import type { FTMSFeatures } from "../ftms-types";

// ============================================================================
// Configuration Input
// ============================================================================

export interface RecordingConfigInput {
  // Core activity details
  activityCategory: ActivityCategory;
  activityLocation: ActivityLocation;
  mode: "planned" | "unplanned";

  // Plan details (if planned)
  plan?: {
    hasStructure: boolean; // Has steps to follow
    hasRoute: boolean; // Has GPS route
    stepCount: number;
    requiresManualAdvance: boolean; // Any "untilFinished" steps
  };

  // Connected devices
  devices: {
    ftmsTrainer?: {
      deviceId: string;
      features: FTMSFeatures;
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
