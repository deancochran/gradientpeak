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
  isStepBasedActivity,
  shouldUseFollowAlong,
} from "../schemas/activity_payload";
import { resolveRecordingGuidancePolicy } from "./recording-guidance-policy";
import type {
  RecordingCapabilities,
  RecordingConfigInput,
  RecordingConfiguration,
} from "../schemas/recording_config";
import type {
  MetricSourceType,
  RecordingLaunchIntent,
  RecordingSessionSnapshot,
} from "../schemas/recording-session";

export interface RecordingConfigLaunchContext {
  plan?: RecordingConfigInput["plan"];
  devices: RecordingConfigInput["devices"];
  gpsAvailable: boolean;
}

export interface RecordingConfigSnapshotContext {
  plan?: RecordingConfigInput["plan"];
  gpsAvailable?: boolean;
}

function hasSourceType(snapshot: RecordingSessionSnapshot, sourceType: MetricSourceType): boolean {
  return snapshot.devices.connected.some((device) => device.sourceTypes.includes(sourceType));
}

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
   * Additive entry point for the new start-time session vocabulary.
   */
  static resolveFromLaunchIntent(
    intent: RecordingLaunchIntent,
    context: RecordingConfigLaunchContext,
  ): RecordingConfiguration {
    return this.resolve(this.buildInputFromLaunchIntent(intent, context));
  }

  /**
   * Resolves a configuration from an immutable session snapshot.
   */
  static resolveFromSessionSnapshot(
    snapshot: RecordingSessionSnapshot,
    context: RecordingConfigSnapshotContext = {},
  ): RecordingConfiguration {
    return this.resolve(this.buildInputFromSessionSnapshot(snapshot, context));
  }

  static buildInputFromLaunchIntent(
    intent: RecordingLaunchIntent,
    context: RecordingConfigLaunchContext,
  ): RecordingConfigInput {
    return {
      activityCategory: intent.activityCategory,
      gpsRecordingEnabled: intent.gpsMode === "on",
      mode: intent.mode === "planned" ? "planned" : "unplanned",
      plan: context.plan,
      devices: context.devices,
      gpsAvailable: context.gpsAvailable,
    };
  }

  static buildInputFromSessionSnapshot(
    snapshot: RecordingSessionSnapshot,
    context: RecordingConfigSnapshotContext = {},
  ): RecordingConfigInput {
    const trainer = snapshot.devices.controllableTrainer;

    return {
      activityCategory: snapshot.activity.category,
      gpsRecordingEnabled: snapshot.activity.gpsMode === "on",
      mode: snapshot.activity.mode === "planned" ? "planned" : "unplanned",
      plan: context.plan ?? {
        hasStructure: snapshot.activity.activityPlanId !== null,
        hasRoute: snapshot.activity.routeId !== null,
        stepCount: 0,
        requiresManualAdvance: !snapshot.policies.controlPolicy.autoAdvanceSteps,
      },
      devices: {
        ftmsTrainer: trainer
          ? {
              deviceId: trainer.deviceId,
              autoControlEnabled:
                snapshot.policies.controlPolicy.trainerMode === "auto" &&
                trainer.supportsAutoControl,
            }
          : undefined,
        hasPowerMeter: hasSourceType(snapshot, "power_meter"),
        hasHeartRateMonitor:
          hasSourceType(snapshot, "chest_strap") || hasSourceType(snapshot, "optical"),
        hasCadenceSensor: hasSourceType(snapshot, "cadence_sensor"),
      },
      gpsAvailable:
        context.gpsAvailable ??
        (snapshot.activity.gpsMode === "on"
          ? snapshot.capabilities.canTrackLocation || hasSourceType(snapshot, "gps")
          : false),
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
    const hasStructuredPlan = input.plan?.hasStructure ?? false;
    const hasFtmsTrainer = !!input.devices.ftmsTrainer;
    const hasRoute = input.plan?.hasRoute ?? false;
    const guidancePolicy = resolveRecordingGuidancePolicy({
      gpsMode: input.gpsRecordingEnabled ? "on" : "off",
      routeAttached: hasRoute,
      structure: input.plan?.structure,
    });

    // Data collection capabilities - straightforward hardware checks
    const canTrackLocation = input.gpsRecordingEnabled && input.gpsAvailable;
    const canTrackPower = input.devices.hasPowerMeter || hasFtmsTrainer;
    const canTrackHeartRate = input.devices.hasHeartRateMonitor;
    const canTrackCadence = input.devices.hasCadenceSensor;

    // UI features - show if the capability makes sense
    // Map: Show if we're tracking real GPS location OR have a route to visualize progress on
    // Indoor routes show map to visualize progress along the route based on distance/effort
    const shouldShowMap = canTrackLocation || hasRoute;

    // Steps: Show only when there's a structured plan to follow
    const shouldShowSteps = hasStructuredPlan;

    // Route overlay: Show if we're tracking location AND have a route to overlay
    const shouldShowRouteOverlay = canTrackLocation && hasRoute;

    // Turn-by-turn: Only when GPS tracking and a route are both available
    const shouldShowTurnByTurn = canTrackLocation && hasRoute;

    // Follow-along: Activity-specific (swim lanes, etc)
    const shouldShowFollowAlong = shouldUseFollowAlong(input.activityCategory);

    // Trainer control: Show whenever a controllable trainer is connected
    // Users can manually control power/resistance OR enable auto-erg if they have a plan/route
    const shouldShowTrainerControl = hasFtmsTrainer;

    // Automation - only enable automatic features when we have data to automate with
    const canAutoAdvanceSteps = hasStructuredPlan && !(input.plan?.requiresManualAdvance ?? false);

    const autoFollowPriority = this.resolveAutoFollowPriority(input, {
      hasStructuredPlan,
      hasRoute,
      guidancePolicy,
    });

    const autoFollowConflict =
      autoFollowPriority !== "none" && !guidancePolicy.trainerAuthorities.simultaneousControlAllowed;

    const autoFollowConflictReason = autoFollowConflict
      ? guidancePolicy.trainerAuthorities.reasons[0] ??
        "Automatic trainer control conflict detected."
      : null;

    // Auto-follow: Can automatically adjust trainer IF user enables it AND we have targets to follow
    const shouldAutoFollowTargets =
      hasFtmsTrainer &&
      autoFollowPriority !== "none" &&
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
      autoFollowPriority,
      autoFollowConflict,
      autoFollowConflictReason,
      primaryMetric,
    };
  }

  private static resolveAutoFollowPriority(
    input: RecordingConfigInput,
    context: {
      hasStructuredPlan: boolean;
      hasRoute: boolean;
      guidancePolicy: ReturnType<typeof resolveRecordingGuidancePolicy>;
    },
  ): RecordingCapabilities["autoFollowPriority"] {
    if (!input.devices.ftmsTrainer?.autoControlEnabled) {
      return "none";
    }

    const available = new Set(context.guidancePolicy.trainerAuthorities.available);
    if (available.has("plan_targets") && available.has("route_simulation")) {
      return "plan_targets";
    }

    if (available.has("plan_targets") || context.hasStructuredPlan) {
      return "plan_targets";
    }

    if (available.has("route_simulation") || context.hasRoute) {
      return "route_simulation";
    }

    return "none";
  }

  /**
   * Determine the primary metric for this recording
   */
  private static determinePrimaryMetric(
    input: RecordingConfigInput,
    computed: { canTrackLocation: boolean; canTrackPower: boolean },
  ): RecordingCapabilities["primaryMetric"] {
    // Priority order:
    if (isStepBasedActivity(input.activityCategory)) return "reps";
    if (computed.canTrackPower) return "power";
    if (computed.canTrackLocation) return "distance";
    return "time";
  }

  /**
   * Validate configuration and return errors/warnings
   */
  private static validate(
    input: RecordingConfigInput,
    capabilities: Omit<RecordingCapabilities, "isValid" | "errors" | "warnings">,
  ): Pick<RecordingCapabilities, "isValid" | "errors" | "warnings"> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // GPS validation - fail when GPS recording is enabled but unavailable
    if (input.gpsRecordingEnabled && !input.gpsAvailable) {
      errors.push(
        "GPS recording is enabled, but GPS is unavailable. Please enable location services.",
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

    if (capabilities.autoFollowConflict && capabilities.autoFollowPriority === "plan_targets") {
      warnings.push(
        "Structured plan targets take priority over route simulation for automatic trainer control during this recording session.",
      );
    }

    // Warn if planned but no structure
    if (input.mode === "planned" && !input.plan?.hasStructure && !input.plan?.hasRoute) {
      warnings.push("Selected plan has no structure. Recording as unplanned.");
    }

    // Info if no sensors for continuous activity
    if (
      isContinuousActivity(input.activityCategory) &&
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
