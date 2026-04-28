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
import type { CanonicalSport } from "./sport";

export const recordingPrimaryMetricSchema = z.enum(["time", "distance", "reps", "power"]);

export type RecordingLaunchSource =
  | "record_tab"
  | "activity_plan"
  | "calendar_event"
  | "route"
  | "manual";

export type RecordingRouteMode = "none" | "preview" | "virtual" | "live_navigation" | "unavailable";

export type RecordingPrimarySurface = "workout" | "route" | "metrics" | "trainer";

export type RecordingBackdropMode =
  | "live_navigation"
  | "virtual_route"
  | "route_preview"
  | "route_unavailable"
  | "gps_map"
  | "gps_unavailable"
  | "ambient";

export type RecordingInsightCard =
  | "metrics"
  | "workout_interval"
  | "trainer"
  | "route_progress"
  | "climb";

export type RecordingQuickAction = "activity" | "gps" | "plan" | "route" | "sensors" | "trainer";

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
  launchSource?: RecordingLaunchSource;

  // Core activity details
  activityCategory: CanonicalSport;
  gpsRecordingEnabled: boolean;
  mode: "planned" | "unplanned";
  eventId?: string | null;
  activityPlanId?: string | null;
  routeId?: string | null;
  routeGeometryAvailable?: boolean;

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
      features?: FTMSFeatures;
      autoControlEnabled: boolean;
      controlReady?: boolean;
    };
    hasPowerMeter: boolean;
    hasHeartRateMonitor: boolean;
    hasCadenceSensor: boolean;
  };

  // Environment
  gpsAvailable: boolean;

  // Runtime session lifecycle
  session?: {
    identityLocked?: boolean;
  };
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

export interface RecordingSessionAuthority {
  category: "user" | "plan";
  structure: "none" | "plan";
  spatial: "none" | "route";
  locationCapture: "gps";
  trainerExecution: "none" | "trainer";
}

export interface RecordingSessionGuidance {
  hasPlan: boolean;
  hasStructuredSteps: boolean;
  hasRoute: boolean;
  hasRouteGeometry: boolean;
  routeMode: RecordingRouteMode;
}

export interface RecordingSessionDevices {
  hasTrainer: boolean;
  trainerControllable: boolean;
  hasPower: boolean;
  hasHeartRate: boolean;
  hasCadence: boolean;
  gpsIntent: "on" | "off";
  gpsAvailable: boolean;
}

export interface RecordingSessionDegradedState {
  gps?: string;
  route?: string;
  plan?: string;
  trainer?: string;
  sensors?: string;
}

export interface RecordingSessionUiPolicy {
  backdropMode: RecordingBackdropMode;
  floatingPanel: {
    defaultCard: RecordingInsightCard;
    availableCards: RecordingInsightCard[];
    forcedExpanded: boolean;
    canMinimize: boolean;
  };
  controls: {
    quickActions: RecordingQuickAction[];
  };
}

export interface RecordingSessionEditing {
  canEditActivity: boolean;
  canEditPlan: boolean;
  canEditRoute: boolean;
  canEditGps: boolean;
  locksIdentityAfterStart: boolean;
}

export interface RecordingSessionMetrics {
  primaryMetric: RecordingCapabilities["primaryMetric"];
  emphasizedMetrics: Array<
    "time" | "distance" | "pace" | "heart_rate" | "power" | "cadence" | "calories"
  >;
}

export interface RecordingSessionSurfaces {
  defaultPrimarySurface: RecordingPrimarySurface;
  availablePrimarySurfaces: RecordingPrimarySurface[];
  quickActions: RecordingQuickAction[];
}

export interface RecordingSessionValidation {
  consequences: string[];
}

export interface RecordingSessionContract {
  authority: RecordingSessionAuthority;
  guidance: RecordingSessionGuidance;
  devices: RecordingSessionDevices;
  degraded: RecordingSessionDegradedState;
  ui: RecordingSessionUiPolicy;
  editing: RecordingSessionEditing;
  metrics: RecordingSessionMetrics;
  surfaces: RecordingSessionSurfaces;
  validation: RecordingSessionValidation;
}

// ============================================================================
// Full Configuration
// ============================================================================

export interface RecordingConfiguration {
  input: RecordingConfigInput;
  capabilities: RecordingCapabilities;
  session: RecordingSessionContract;
}
