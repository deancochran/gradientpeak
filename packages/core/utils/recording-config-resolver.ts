/**
 * Recording Configuration Resolver
 *
 * Analyzes recording context and determines:
 * 1. What data can be collected
 * 2. What UI should be shown
 * 3. What automation should run
 * 4. Whether the configuration is valid
 */

import {
    isContinuousActivity,
    isOutdoorActivity,
    isStepBasedActivity,
    shouldUseFollowAlong
} from '../schemas/activity_payload'
import type { RecordingCapabilities, RecordingConfigInput, RecordingConfiguration } from '../schemas/recording_config'

export class RecordingConfigResolver {
  /**
   * Main entry point - converts input to full configuration
   */
  static resolve(input: RecordingConfigInput): RecordingConfiguration {
    const capabilities = this.computeCapabilities(input)
    const validation = this.validate(input, capabilities)

    return {
      input,
      capabilities: {
        ...capabilities,
        ...validation
      }
    }
  }

  /**
   * Compute what the app can do based on context
   */
  private static computeCapabilities(input: RecordingConfigInput): Omit<RecordingCapabilities, 'isValid' | 'errors' | 'warnings'> {
    const isOutdoor = isOutdoorActivity(input.activityType)
    const hasStructuredPlan = input.plan?.hasStructure ?? false
    const hasFtmsTrainer = !!input.devices.ftmsTrainer
    const hasRoute = input.plan?.hasRoute ?? false

    // Data collection capabilities
    const canTrackLocation = isOutdoor && input.gpsAvailable
    const canTrackPower = input.devices.hasPowerMeter || hasFtmsTrainer
    const canTrackHeartRate = input.devices.hasHeartRateMonitor
    const canTrackCadence = input.devices.hasCadenceSensor

    // UI features
    const shouldShowMap = canTrackLocation || (hasRoute && !isOutdoor) // Show map if tracking GPS OR if indoor with route (visualization)
    const shouldShowSteps = hasStructuredPlan
    const shouldShowRouteOverlay = canTrackLocation && hasRoute
    const shouldShowTurnByTurn = canTrackLocation && hasRoute // Only outdoor with route
    const shouldShowFollowAlong = shouldUseFollowAlong(input.activityType) // Swim, other
    const shouldShowPowerTarget = hasFtmsTrainer && hasStructuredPlan

    // Automation
    const canAutoAdvanceSteps = hasStructuredPlan && !(input.plan?.requiresManualAdvance ?? false)
    const canAutoControlTrainer = hasFtmsTrainer &&
                                   hasStructuredPlan &&
                                   (input.devices.ftmsTrainer?.autoControlEnabled ?? false)

    // Primary metric
    const primaryMetric = this.determinePrimaryMetric(input, {
      canTrackLocation,
      canTrackPower
    })

    return {
      canTrackLocation,
      canTrackPower,
      canTrackHeartRate,
      canTrackCadence,
      shouldShowMap,
      shouldShowSteps,
      shouldShowRouteOverlay,
      shouldShowTurnByTurn,
      shouldShowFollowAlong,
      shouldShowPowerTarget,
      canAutoAdvanceSteps,
      canAutoControlTrainer,
      primaryMetric
    }
  }

  /**
   * Determine the primary metric for this recording
   */
  private static determinePrimaryMetric(
    input: RecordingConfigInput,
    computed: { canTrackLocation: boolean; canTrackPower: boolean }
  ): RecordingCapabilities['primaryMetric'] {
    // Priority order:
    if (isStepBasedActivity(input.activityType)) return 'reps'
    if (computed.canTrackPower) return 'power'
    if (computed.canTrackLocation) return 'distance'
    return 'time'
  }

  /**
   * Validate configuration and return errors/warnings
   */
  private static validate(
    input: RecordingConfigInput,
    capabilities: Omit<RecordingCapabilities, 'isValid' | 'errors' | 'warnings'>
  ): Pick<RecordingCapabilities, 'isValid' | 'errors' | 'warnings'> {
    const errors: string[] = []
    const warnings: string[] = []

    // GPS validation - outdoor activities REQUIRE GPS
    if (isOutdoorActivity(input.activityType) && !input.gpsAvailable) {
      errors.push('GPS is required for outdoor activities. Please enable location services.')
    }

    // Route navigation requires GPS
    if (capabilities.shouldShowTurnByTurn && !capabilities.canTrackLocation) {
      errors.push('Route navigation requires GPS.')
    }

    // Warn if trainer control is enabled but no structured plan
    if (input.devices.ftmsTrainer?.autoControlEnabled && !input.plan?.hasStructure) {
      warnings.push('Auto trainer control requires a structured plan. Control will be manual.')
    }

    // Warn if planned but no structure
    if (input.mode === 'planned' && !input.plan?.hasStructure) {
      warnings.push('Selected plan has no structure. Recording as unplanned.')
    }

    // Info if no sensors for continuous activity
    if (isContinuousActivity(input.activityType) &&
        !input.devices.hasPowerMeter &&
        !input.devices.hasHeartRateMonitor &&
        !input.devices.hasCadenceSensor &&
        !input.devices.ftmsTrainer) {
      warnings.push('No sensors connected. Metrics will be limited.')
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    }
  }
}
