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
  shouldUseFollowAlong,
} from "../schemas/activity_payload";
import type {
  RecordingCapabilities,
  RecordingConfigInput,
  RecordingConfiguration,
} from "../schemas/recording_config";

export class RecordingConfigResolver {
  /**
   * Main entry point - converts input to full configuration
   */
  static resolve(input: RecordingConfigInput): RecordingConfiguration {
    const capabilities = this.computeCapabilities(input);
    const validation = this.validate(input, capabilities);

    return {
      input,
      capabilities: {
        ...capabilities,
        ...validation,
      },
    };
  }

  /**
   * Compute what the app can do based on context
   *
   * Philosophy: Show capabilities whenever they exist, unless hiding them prevents user errors.
   * Allow maximum flexibility - users should control their experience.
   */
  private static computeCapabilities(
    input: RecordingConfigInput,
  ): Omit<RecordingCapabilities, "isValid" | "errors" | "warnings"> {
    const isOutdoor = isOutdoorActivity(input.activityType);
    const hasStructuredPlan = input.plan?.hasStructure ?? false;
    const hasFtmsTrainer = !!input.devices.ftmsTrainer;
    const hasRoute = input.plan?.hasRoute ?? false;

    // Data collection capabilities - straightforward hardware checks
    const canTrackLocation = isOutdoor && input.gpsAvailable;
    const canTrackPower = input.devices.hasPowerMeter || hasFtmsTrainer;
    const canTrackHeartRate = input.devices.hasHeartRateMonitor;
    const canTrackCadence = input.devices.hasCadenceSensor;

    // UI features - show if the capability makes sense
    // Map: Show if we're tracking real GPS location OR have a route to visualize progress on
    // Indoor routes show map to visualize progress along the route based on distance/effort
    const shouldShowMap = canTrackLocation || hasRoute;

    // Steps: Show if there's a structured plan to follow
    const shouldShowSteps = hasStructuredPlan;

    // Route overlay: Show if we're tracking location AND have a route to overlay
    const shouldShowRouteOverlay = canTrackLocation && hasRoute;

    // Turn-by-turn: Only for outdoor navigation with GPS + route
    const shouldShowTurnByTurn = canTrackLocation && hasRoute;

    // Follow-along: Activity-specific (swim lanes, etc)
    const shouldShowFollowAlong = shouldUseFollowAlong(input.activityType);

    // Trainer control: Show whenever a controllable trainer is connected
    // Users can manually control power/resistance OR enable auto-erg if they have a plan/route
    const shouldShowTrainerControl = hasFtmsTrainer;

    // Automation - only enable automatic features when we have data to automate with
    const canAutoAdvanceSteps =
      hasStructuredPlan && !(input.plan?.requiresManualAdvance ?? false);

    // Auto-follow: Can automatically adjust trainer IF user enables it AND we have targets to follow
    const shouldAutoFollowTargets =
      hasFtmsTrainer &&
      (hasStructuredPlan || hasRoute) && // Plan provides power targets, route provides grade
      (input.devices.ftmsTrainer?.autoControlEnabled ?? false);

    // Primary metric
    const primaryMetric = this.determinePrimaryMetric(input, {
      canTrackLocation,
      canTrackPower,
    });

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
      shouldShowTrainerControl,
      canAutoAdvanceSteps,
      shouldAutoFollowTargets,
      primaryMetric,
    };
  }

  /**
   * Determine the primary metric for this recording
   */
  private static determinePrimaryMetric(
    input: RecordingConfigInput,
    computed: { canTrackLocation: boolean; canTrackPower: boolean },
  ): RecordingCapabilities["primaryMetric"] {
    // Priority order:
    if (isStepBasedActivity(input.activityType)) return "reps";
    if (computed.canTrackPower) return "power";
    if (computed.canTrackLocation) return "distance";
    return "time";
  }

  /**
   * Validate configuration and return errors/warnings
   */
  private static validate(
    input: RecordingConfigInput,
    capabilities: Omit<
      RecordingCapabilities,
      "isValid" | "errors" | "warnings"
    >,
  ): Pick<RecordingCapabilities, "isValid" | "errors" | "warnings"> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // GPS validation - outdoor activities REQUIRE GPS
    if (isOutdoorActivity(input.activityType) && !input.gpsAvailable) {
      errors.push(
        "GPS is required for outdoor activities. Please enable location services.",
      );
    }

    // Route navigation requires GPS
    if (capabilities.shouldShowTurnByTurn && !capabilities.canTrackLocation) {
      errors.push("Route navigation requires GPS.");
    }

    // Warn if auto-control is enabled but we have no targets to follow
    if (
      input.devices.ftmsTrainer?.autoControlEnabled &&
      !input.plan?.hasStructure &&
      !input.plan?.hasRoute
    ) {
      warnings.push(
        "Auto ERG requires a structured plan or route with grade data. You can still manually control the trainer.",
      );
    }

    // Warn if planned but no structure
    if (input.mode === "planned" && !input.plan?.hasStructure) {
      warnings.push("Selected plan has no structure. Recording as unplanned.");
    }

    // Info if no sensors for continuous activity
    if (
      isContinuousActivity(input.activityType) &&
      !input.devices.hasPowerMeter &&
      !input.devices.hasHeartRateMonitor &&
      !input.devices.hasCadenceSensor &&
      !input.devices.ftmsTrainer
    ) {
      warnings.push("No sensors connected. Metrics will be limited.");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
