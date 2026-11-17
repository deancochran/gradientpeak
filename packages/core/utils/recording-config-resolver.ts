/**
 * Recording Configuration Resolver
 *
 * Analyzes recording context and determines:
 * 1. What data can be collected
 * 2. What UI should be shown
 * 3. What automation should run
 * 4. Whether the configuration is valid
 */

import type { CompiledActivityStepOccurrence } from "../activity-plan";
import { compileActivityPlan } from "../activity-plan";
import {
  isContinuousActivity,
  isStepBasedActivity,
  shouldUseFollowAlong,
} from "../schemas/activity_payload";
import type {
  RecordingBackdropMode,
  RecordingCapabilities,
  RecordingConfigInput,
  RecordingConfiguration,
  RecordingInsightCard,
  RecordingPrimarySurface,
  RecordingQuickAction,
  RecordingSessionContract,
} from "../schemas/recording_config";
import type {
  MetricSourceType,
  RecordingLaunchIntent,
  RecordingSessionSnapshot,
} from "../schemas/recording-session";

export interface RecordingConfigLaunchContext {
  launchSource?: RecordingConfigInput["launchSource"];
  plan?: RecordingConfigInput["plan"];
  routeGeometryAvailable?: boolean;
  devices: RecordingConfigInput["devices"];
  gpsAvailable: boolean;
  session?: RecordingConfigInput["session"];
}

export interface RecordingConfigSnapshotContext {
  launchSource?: RecordingConfigInput["launchSource"];
  plan?: RecordingConfigInput["plan"];
  activityPlanId?: string | null;
  routeId?: string | null;
  routeGeometryAvailable?: boolean;
  gpsAvailable?: boolean;
  session?: RecordingConfigInput["session"];
}

function hasSourceType(snapshot: RecordingSessionSnapshot, sourceType: MetricSourceType): boolean {
  return snapshot.devices.connected.some((device) => device.sourceTypes.includes(sourceType));
}

export const RecordingConfigResolver = {
  /**
   * Main entry point - converts input to full configuration
   */
  resolve(input: RecordingConfigInput): RecordingConfiguration {
    const gpsFreeInput: RecordingConfigInput = {
      ...input,
      gpsRecordingEnabled: false,
      gpsAvailable: false,
    };
    const capabilities = RecordingConfigResolver.computeCapabilities(gpsFreeInput);
    const validation = RecordingConfigResolver.validate(gpsFreeInput, capabilities);
    const fullCapabilities = {
      ...capabilities,
      ...validation,
    };

    return {
      input: gpsFreeInput,
      capabilities: fullCapabilities,
      session: RecordingConfigResolver.buildSessionContract(gpsFreeInput, fullCapabilities),
    };
  },

  /** Resolves activity-category-specific recording UI and metrics for the active compiled segment. */
  resolveForOccurrence(
    input: RecordingConfigInput,
    occurrence: Pick<CompiledActivityStepOccurrence, "activity_category">,
  ): RecordingConfiguration {
    return RecordingConfigResolver.resolve({
      ...input,
      activityCategory: occurrence.activity_category,
    });
  },

  /**
   * Additive entry point for the new start-time session vocabulary.
   */
  resolveFromLaunchIntent(
    intent: RecordingLaunchIntent,
    context: RecordingConfigLaunchContext,
  ): RecordingConfiguration {
    return RecordingConfigResolver.resolve(
      RecordingConfigResolver.buildInputFromLaunchIntent(intent, context),
    );
  },

  /**
   * Resolves a configuration from an immutable session snapshot.
   */
  resolveFromSessionSnapshot(
    snapshot: RecordingSessionSnapshot,
    context: RecordingConfigSnapshotContext = {},
  ): RecordingConfiguration {
    return RecordingConfigResolver.resolve(
      RecordingConfigResolver.buildInputFromSessionSnapshot(snapshot, context),
    );
  },

  buildInputFromLaunchIntent(
    intent: RecordingLaunchIntent,
    context: RecordingConfigLaunchContext,
  ): RecordingConfigInput {
    return {
      launchSource: context.launchSource ?? "manual",
      activityCategory: intent.activityCategory,
      gpsRecordingEnabled: false,
      mode: intent.mode === "planned" ? "planned" : "unplanned",
      ...(intent.eventId === undefined ? {} : { eventId: intent.eventId }),
      ...(intent.activityPlanId === undefined ? {} : { activityPlanId: intent.activityPlanId }),
      ...(intent.routeId === undefined ? {} : { routeId: intent.routeId }),
      ...(context.routeGeometryAvailable === undefined
        ? {}
        : { routeGeometryAvailable: context.routeGeometryAvailable }),
      ...(context.plan === undefined ? {} : { plan: context.plan }),
      devices: context.devices,
      gpsAvailable: false,
      ...(context.session === undefined ? {} : { session: context.session }),
    };
  },

  buildInputFromSessionSnapshot(
    snapshot: RecordingSessionSnapshot,
    context: RecordingConfigSnapshotContext = {},
  ): RecordingConfigInput {
    const trainer = snapshot.devices.controllableTrainer;
    const activityPlanId =
      context.activityPlanId !== undefined
        ? context.activityPlanId
        : snapshot.activity.activityPlanId;
    const routeId = context.routeId !== undefined ? context.routeId : snapshot.activity.routeId;

    return {
      launchSource: context.launchSource ?? "manual",
      activityCategory: snapshot.activity.activity_category,
      gpsRecordingEnabled: false,
      mode: activityPlanId ? "planned" : "unplanned",
      ...(snapshot.activity.eventId === undefined ? {} : { eventId: snapshot.activity.eventId }),
      ...(activityPlanId === undefined ? {} : { activityPlanId }),
      ...(routeId === undefined ? {} : { routeId }),
      ...(context.routeGeometryAvailable === undefined
        ? {}
        : { routeGeometryAvailable: context.routeGeometryAvailable }),
      plan: context.plan ?? {
        hasStructure: activityPlanId !== null,
        stepCount: 0,
        requiresManualAdvance: !snapshot.policies.controlPolicy.autoAdvanceSteps,
      },
      devices: {
        ...(trainer
          ? {
              ftmsTrainer: {
                deviceId: trainer.deviceId,
                autoControlEnabled:
                  snapshot.policies.controlPolicy.trainerMode === "auto" &&
                  trainer.supportsAutoControl,
                controlReady: trainer.supportsManualControl || trainer.supportsAutoControl,
              },
            }
          : {}),
        hasPowerMeter: hasSourceType(snapshot, "power_meter"),
        hasHeartRateMonitor:
          hasSourceType(snapshot, "chest_strap") || hasSourceType(snapshot, "optical"),
        hasCadenceSensor: hasSourceType(snapshot, "cadence_sensor"),
      },
      gpsAvailable: false,
      session: context.session ?? { identityLocked: true },
    };
  },

  /**
   * Compute what the app can do based on context
   *
   * Philosophy: Show capabilities whenever they exist, unless hiding them prevents user errors.
   * Allow maximum flexibility - users should control their experience.
   */
  computeCapabilities(
    input: RecordingConfigInput,
  ): Omit<RecordingCapabilities, "isValid" | "errors" | "warnings"> {
    const hasStructuredPlan = input.plan?.hasStructure ?? false;
    const hasFtmsTrainer = !!input.devices.ftmsTrainer;
    const canUseTrainer = hasFtmsTrainer;
    const trainerControlReady = canUseTrainer && Boolean(input.devices.ftmsTrainer?.controlReady);
    const _hasRoute = RecordingConfigResolver.hasRoute(input);
    const hasRouteGeometry = RecordingConfigResolver.hasRouteGeometry(input);
    const autoFollowPriority = RecordingConfigResolver.determineAutoFollowPriority(input, {
      hasStructuredPlan,
      hasRouteGeometry,
    });
    const autoFollowConflict =
      autoFollowPriority === "plan_targets" &&
      hasRouteGeometry &&
      RecordingConfigResolver.hasTrainerControllablePlanTargets(input.plan?.structure);
    const autoFollowConflictReason = autoFollowConflict
      ? "Structured plan targets take priority over route simulation for automatic trainer control."
      : null;

    // Data collection capabilities - straightforward hardware checks
    const canTrackLocation = false;
    const canTrackPower = input.devices.hasPowerMeter || canUseTrainer;
    const canTrackHeartRate = input.devices.hasHeartRateMonitor;
    const canTrackCadence = input.devices.hasCadenceSensor;

    // UI features - show if the capability makes sense
    // Map: Show if we're tracking real GPS location OR have a route to visualize progress on
    // Indoor routes show map to visualize progress along the route based on distance/effort
    const shouldShowMap = canTrackLocation || hasRouteGeometry;

    // Steps: Show only when there's a structured plan to follow
    const shouldShowSteps = hasStructuredPlan;

    // Route overlay: Show if we're tracking location AND have a route to overlay
    const shouldShowRouteOverlay = false;

    // Turn-by-turn: Only when GPS tracking and a route are both available
    const shouldShowTurnByTurn = false;

    // Follow-along: Activity-specific (swim lanes, etc)
    const shouldShowFollowAlong = shouldUseFollowAlong(input.activityCategory);

    // Trainer control is indoor-only; connected trainers can stay paired during GPS sessions.
    const shouldShowTrainerControl = trainerControlReady;

    // Automation - only enable automatic features when we have data to automate with
    const canAutoAdvanceSteps = hasStructuredPlan && !(input.plan?.requiresManualAdvance ?? false);

    // Auto-follow: Can automatically adjust trainer IF user enables it AND we have targets to follow
    const shouldAutoFollowTargets =
      canUseTrainer &&
      trainerControlReady &&
      autoFollowPriority !== "none" &&
      (input.devices.ftmsTrainer?.autoControlEnabled ?? false);

    // Primary metric
    const primaryMetric = RecordingConfigResolver.determinePrimaryMetric(input, {
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
  },

  determineAutoFollowPriority(
    input: RecordingConfigInput,
    context: {
      hasStructuredPlan: boolean;
      hasRouteGeometry: boolean;
    },
  ): RecordingCapabilities["autoFollowPriority"] {
    if (!input.devices.ftmsTrainer?.autoControlEnabled) {
      return "none";
    }

    if (
      context.hasStructuredPlan &&
      RecordingConfigResolver.hasTrainerControllablePlanTargets(input.plan?.structure)
    ) {
      return "plan_targets";
    }

    if (context.hasStructuredPlan && !input.plan?.structure) {
      return "plan_targets";
    }

    if (context.hasRouteGeometry) {
      return "route_simulation";
    }

    return "none";
  },

  hasTrainerControllablePlanTargets(structure: unknown): boolean {
    if (!structure) return false;
    try {
      return compileActivityPlan(structure).occurrences.some(
        (occurrence) =>
          occurrence.role === "activity" &&
          occurrence.targets.some(
            (target) =>
              (target.type === "%FTP" ||
                target.type === "watts" ||
                target.type === "speed" ||
                target.type === "cadence") &&
              // V3 validation has already checked activity_category/target compatibility.
              occurrence.activity_category !== "other",
          ),
      );
    } catch {
      return false;
    }
  },

  buildSessionContract(
    input: RecordingConfigInput,
    capabilities: RecordingCapabilities,
  ): RecordingSessionContract {
    const hasPlan = RecordingConfigResolver.hasPlan(input);
    const hasStructuredPlan = input.plan?.hasStructure ?? false;
    const hasRoute = RecordingConfigResolver.hasRoute(input);
    const hasRouteGeometry = RecordingConfigResolver.hasRouteGeometry(input);
    const hasTrainer = Boolean(input.devices.ftmsTrainer);
    const trainerControllable = hasTrainer && Boolean(input.devices.ftmsTrainer?.controlReady);
    const routeMode = RecordingConfigResolver.determineRouteMode(input);
    const backdropMode = RecordingConfigResolver.determineBackdropMode(routeMode);
    const degraded = RecordingConfigResolver.determineDegradedState(input);
    const insightCards = RecordingConfigResolver.determineInsightCards({
      hasStructuredPlan,
      hasRouteGeometry,
      trainerControllable,
    });
    const quickActions = RecordingConfigResolver.determineQuickActions({
      hasPlan,
      hasRoute,
      trainerControllable,
    });
    const defaultPrimarySurface = RecordingConfigResolver.determinePrimarySurface({
      hasStructuredPlan,
      hasRouteGeometry,
      trainerControllable,
      routeMode,
    });
    const availablePrimarySurfaces = RecordingConfigResolver.determineAvailableSurfaces({
      hasStructuredPlan,
      hasRouteGeometry,
      hasTrainer,
    });
    const identityLocked = input.session?.identityLocked ?? false;
    const canUseGpsSurface = false;

    return {
      authority: {
        activity_category: hasPlan ? "plan" : "user",
        structure: hasPlan ? "plan" : "none",
        spatial: hasRoute ? "route" : "none",
        locationCapture: "none",
        trainerExecution: hasTrainer ? "trainer" : "none",
      },
      guidance: {
        hasPlan,
        hasStructuredSteps: hasStructuredPlan,
        hasRoute,
        hasRouteGeometry,
        routeMode,
      },
      devices: {
        hasTrainer,
        trainerControllable,
        hasPower: capabilities.canTrackPower,
        hasHeartRate: capabilities.canTrackHeartRate,
        hasCadence: capabilities.canTrackCadence,
        gpsIntent: "off",
        gpsAvailable: false,
      },
      degraded,
      ui: {
        backdropMode,
        floatingPanel: {
          defaultCard: insightCards[0] ?? "metrics",
          availableCards: insightCards,
          forcedExpanded: !canUseGpsSurface,
          canMinimize: canUseGpsSurface,
        },
        controls: {
          quickActions,
        },
      },
      editing: {
        canEditActivity: !identityLocked && !hasPlan,
        canEditPlan: true,
        canEditRoute: true,
        canEditGps: false,
        locksIdentityAfterStart: true,
      },
      metrics: {
        primaryMetric: capabilities.primaryMetric,
        emphasizedMetrics: RecordingConfigResolver.determineEmphasizedMetrics(input, capabilities),
      },
      surfaces: {
        defaultPrimarySurface,
        availablePrimarySurfaces,
        quickActions,
      },
      validation: {
        consequences: RecordingConfigResolver.determineConsequences(input, capabilities, routeMode),
      },
    };
  },

  /**
   * Determine the primary metric for this recording
   */
  determinePrimaryMetric(
    input: RecordingConfigInput,
    computed: { canTrackLocation: boolean; canTrackPower: boolean },
  ): RecordingCapabilities["primaryMetric"] {
    // Priority order:
    if (isStepBasedActivity(input.activityCategory)) return "reps";
    if (computed.canTrackPower) return "power";
    if (computed.canTrackLocation) return "distance";
    return "time";
  },

  determineRouteMode(input: RecordingConfigInput) {
    if (!RecordingConfigResolver.hasRoute(input)) {
      return "none" as const;
    }

    if (!RecordingConfigResolver.hasRouteGeometry(input)) {
      return "unavailable" as const;
    }

    return "virtual" as const;
  },

  determineBackdropMode(
    routeMode: "none" | "preview" | "virtual" | "live_navigation" | "unavailable",
  ): RecordingBackdropMode {
    if (routeMode === "virtual") {
      return "virtual_route";
    }

    if (routeMode === "preview") {
      return "route_preview";
    }

    if (routeMode === "unavailable") {
      return "route_unavailable";
    }

    return "ambient";
  },

  determineInsightCards(params: {
    hasStructuredPlan: boolean;
    hasRouteGeometry: boolean;
    trainerControllable: boolean;
  }): RecordingInsightCard[] {
    const cards: RecordingInsightCard[] = [];

    if (params.hasStructuredPlan) {
      cards.push("activity_interval");
    }

    if (params.hasRouteGeometry) {
      cards.push("route_progress");
    }

    if (params.trainerControllable) {
      cards.push("trainer");
    }

    cards.push("metrics");

    return Array.from(new Set(cards));
  },

  determinePrimarySurface(params: {
    hasStructuredPlan: boolean;
    hasRouteGeometry: boolean;
    trainerControllable: boolean;
    routeMode: "none" | "preview" | "virtual" | "live_navigation" | "unavailable";
  }): RecordingPrimarySurface {
    if (params.hasStructuredPlan) {
      return "activity";
    }

    if (params.hasRouteGeometry && params.routeMode !== "none") {
      return "route";
    }

    if (params.trainerControllable) {
      return "trainer";
    }

    return "metrics";
  },

  determineAvailableSurfaces(params: {
    hasStructuredPlan: boolean;
    hasRouteGeometry: boolean;
    hasTrainer: boolean;
  }): RecordingPrimarySurface[] {
    const surfaces: RecordingPrimarySurface[] = ["metrics"];

    if (params.hasStructuredPlan) {
      surfaces.unshift("activity");
    }

    if (params.hasRouteGeometry) {
      surfaces.push("route");
    }

    if (params.hasTrainer) {
      surfaces.push("trainer");
    }

    return surfaces;
  },

  determineQuickActions(params: {
    hasPlan: boolean;
    hasRoute: boolean;
    trainerControllable: boolean;
  }): RecordingQuickAction[] {
    const actions: RecordingQuickAction[] = ["sensors"];

    if (!params.hasPlan) {
      actions.unshift("activity");
    }

    actions.push("plan");
    actions.push("route");
    if (params.trainerControllable) {
      actions.push("trainer");
    }

    return actions;
  },

  determineEmphasizedMetrics(
    input: RecordingConfigInput,
    capabilities: Pick<
      RecordingCapabilities,
      | "primaryMetric"
      | "canTrackLocation"
      | "canTrackHeartRate"
      | "canTrackPower"
      | "canTrackCadence"
    >,
  ): RecordingSessionContract["metrics"]["emphasizedMetrics"] {
    const metrics: RecordingSessionContract["metrics"]["emphasizedMetrics"] = ["time"];

    if (capabilities.primaryMetric === "distance" || capabilities.canTrackLocation) {
      metrics.push("distance");
      metrics.push("pace");
    }

    if (capabilities.canTrackPower) {
      metrics.push("power");
    }

    if (capabilities.canTrackHeartRate) {
      metrics.push("heart_rate");
    }

    if (capabilities.canTrackCadence) {
      metrics.push("cadence");
    }

    metrics.push("calories");

    if (input.activityCategory === "strength" && !metrics.includes("distance")) {
      return ["time", "calories"];
    }

    return Array.from(new Set(metrics));
  },

  determineConsequences(
    input: RecordingConfigInput,
    capabilities: Pick<RecordingCapabilities, "canTrackLocation" | "shouldAutoFollowTargets">,
    routeMode: "none" | "preview" | "virtual" | "live_navigation" | "unavailable",
  ): string[] {
    const consequences: string[] = [];

    if (RecordingConfigResolver.hasPlan(input)) {
      consequences.push("Attached plan owns activity structure for this session.");
    }

    if (RecordingConfigResolver.hasPlan(input)) {
      consequences.push("Activity identity locks after recording starts.");
    }

    if (routeMode === "virtual") {
      consequences.push(
        "Attached route will use sensor or manual distance without capturing location.",
      );
    }

    if (routeMode === "unavailable") {
      consequences.push("Attached route has no map geometry available for preview or navigation.");
    }

    if (input.devices.ftmsTrainer && !capabilities.shouldAutoFollowTargets) {
      consequences.push(
        "Trainer control is available, but automatic target following is not active.",
      );
    }

    if (capabilities.shouldAutoFollowTargets) {
      consequences.push("Automatic trainer target following is available for this session.");
    }

    if (
      !input.devices.hasPowerMeter &&
      !input.devices.hasHeartRateMonitor &&
      !input.devices.hasCadenceSensor &&
      !input.devices.ftmsTrainer
    ) {
      consequences.push("Live metrics will be limited until sensors are connected.");
    }

    return consequences;
  },

  hasPlan(input: RecordingConfigInput) {
    return (
      input.mode === "planned" ||
      (input.activityPlanId !== null && input.activityPlanId !== undefined)
    );
  },

  hasRoute(input: RecordingConfigInput) {
    return Boolean(input.routeId);
  },

  hasRouteGeometry(input: RecordingConfigInput) {
    const hasRoute = RecordingConfigResolver.hasRoute(input);
    if (!hasRoute) return false;

    return input.routeGeometryAvailable ?? true;
  },

  determineDegradedState(input: RecordingConfigInput): RecordingSessionContract["degraded"] {
    const degraded: RecordingSessionContract["degraded"] = {};

    if (
      RecordingConfigResolver.hasRoute(input) &&
      !RecordingConfigResolver.hasRouteGeometry(input)
    ) {
      degraded.route = "missing_geometry";
    }

    if (input.devices.ftmsTrainer && !input.devices.ftmsTrainer.controlReady) {
      degraded.trainer = "control_not_ready";
    }

    return degraded;
  },

  /**
   * Validate configuration and return errors/warnings
   */
  validate(
    input: RecordingConfigInput,
    capabilities: Omit<RecordingCapabilities, "isValid" | "errors" | "warnings">,
  ): Pick<RecordingCapabilities, "isValid" | "errors" | "warnings"> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Warn if auto-control is enabled but we have no targets to follow
    if (
      input.devices.ftmsTrainer?.autoControlEnabled &&
      !input.plan?.hasStructure &&
      !input.routeId
    ) {
      warnings.push(
        "Auto ERG requires a structured plan or route with grade data. You can still manually control the trainer.",
      );
    }

    if (capabilities.autoFollowConflict && capabilities.autoFollowConflictReason) {
      warnings.push(capabilities.autoFollowConflictReason);
    }

    // Warn if planned but no structure
    if (input.mode === "planned" && !input.plan?.hasStructure) {
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
  },
};
