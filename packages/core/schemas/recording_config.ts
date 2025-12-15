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

import type { FTMSFeatures } from "../../apps/mobile/lib/services/ActivityRecorder/FTMSController"
import type { PublicActivityType } from "./activity_payload"

// ============================================================================
// Configuration Input
// ============================================================================

export interface RecordingConfigInput {
  // Core activity details
  activityType: PublicActivityType
  mode: 'planned' | 'unplanned'

  // Plan details (if planned)
  plan?: {
    hasStructure: boolean      // Has steps to follow
    hasRoute: boolean          // Has GPS route
    stepCount: number
    requiresManualAdvance: boolean  // Any "untilFinished" steps
  }

  // Connected devices
  devices: {
    ftmsTrainer?: {
      deviceId: string
      features: FTMSFeatures
      autoControlEnabled: boolean
    }
    hasPowerMeter: boolean
    hasHeartRateMonitor: boolean
    hasCadenceSensor: boolean
  }

  // Environment
  gpsAvailable: boolean
}

// ============================================================================
// Capabilities - What the app can/should do
// ============================================================================

export interface RecordingCapabilities {
  // Data collection
  canTrackLocation: boolean
  canTrackPower: boolean
  canTrackHeartRate: boolean
  canTrackCadence: boolean

  // UI features - what to show
  shouldShowMap: boolean
  shouldShowSteps: boolean
  shouldShowRouteOverlay: boolean
  shouldShowTurnByTurn: boolean
  shouldShowFollowAlong: boolean
  shouldShowPowerTarget: boolean

  // Automation - what to do automatically
  canAutoAdvanceSteps: boolean
  canAutoControlTrainer: boolean

  // Primary metric for navigation
  primaryMetric: 'time' | 'distance' | 'reps' | 'power'

  // Validation
  isValid: boolean
  errors: string[]
  warnings: string[]
}

// ============================================================================
// Full Configuration
// ============================================================================

export interface RecordingConfiguration {
  input: RecordingConfigInput
  capabilities: RecordingCapabilities
}
