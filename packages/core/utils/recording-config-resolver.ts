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
  routeGeometryAvailable?: boolean;
  gpsAvailable?: boolean;
  session?: RecordingConfigInput["session"];
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
    const fullCapabilities = {
      ...capabilities,
      ...validation,
    };

    return {
      input,
      capabilities: fullCapabilities,
      session: this.buildSessionContract(input, fullCapabilities),
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
      launchSource: context.launchSource ?? "manual",
      activityCategory: intent.activityCategory,
      gpsRecordingEnabled: intent.gpsMode === "on",
      mode: intent.mode === "planned" ? "planned" : "unplanned",
      eventId: intent.eventId,
      activityPlanId: intent.activityPlanId,
      routeId: intent.routeId,
      routeGeometryAvailable: context.routeGeometryAvailable,
      plan: context.plan,
      devices: context.devices,
      gpsAvailable: context.gpsAvailable,
      session: context.session,
    };
  }

  static buildInputFromSessionSnapshot(
    snapshot: RecordingSessionSnapshot,
    context: RecordingConfigSnapshotContext = {},
  ): RecordingConfigInput {
    const trainer = snapshot.devices.controllableTrainer;

    return {
      launchSource: context.launchSource ?? "manual",
      activityCategory: snapshot.activity.category,
      gpsRecordingEnabled: snapshot.activity.gpsMode === "on",
      mode: snapshot.activity.mode === "planned" ? "planned" : "unplanned",
      eventId: snapshot.activity.eventId,
      activityPlanId: snapshot.activity.activityPlanId,
      routeId: snapshot.activity.routeId,
      routeGeometryAvailable: context.routeGeometryAvailable,
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
              controlReady: trainer.supportsManualControl || trainer.supportsAutoControl,
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
      session: context.session ?? { identityLocked: true },
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
    const trainerControlReady = Boolean(input.devices.ftmsTrainer?.controlReady);
    const hasRoute = this.hasRoute(input);
    const hasRouteGeometry = this.hasRouteGeometry(input);

    // Data collection capabilities - straightforward hardware checks
    const canTrackLocation = input.gpsRecordingEnabled && input.gpsAvailable;
    const canTrackPower = input.devices.hasPowerMeter || hasFtmsTrainer;
    const canTrackHeartRate = input.devices.hasHeartRateMonitor;
    const canTrackCadence = input.devices.hasCadenceSensor;

    // UI features - show if the capability makes sense
    // Map: Show if we're tracking real GPS location OR have a route to visualize progress on
    // Indoor routes show map to visualize progress along the route based on distance/effort
    const shouldShowMap = canTrackLocation || hasRouteGeometry;

    // Steps: Show only when there's a structured plan to follow
    const shouldShowSteps = hasStructuredPlan;

    // Route overlay: Show if we're tracking location AND have a route to overlay
    const shouldShowRouteOverlay = canTrackLocation && hasRouteGeometry;

    // Turn-by-turn: Only when GPS tracking and a route are both available
    const shouldShowTurnByTurn = canTrackLocation && hasRouteGeometry;

    // Follow-along: Activity-specific (swim lanes, etc)
    const shouldShowFollowAlong = shouldUseFollowAlong(input.activityCategory);

    // Trainer control: Show whenever a controllable trainer is connected
    // Users can manually control power/resistance OR enable auto-erg if they have a plan/route
    const shouldShowTrainerControl = trainerControlReady;

    // Automation - only enable automatic features when we have data to automate with
    const canAutoAdvanceSteps = hasStructuredPlan && !(input.plan?.requiresManualAdvance ?? false);

    // Auto-follow: Can automatically adjust trainer IF user enables it AND we have targets to follow
    const shouldAutoFollowTargets =
      hasFtmsTrainer &&
      trainerControlReady &&
      (hasStructuredPlan || hasRouteGeometry) && // Plan provides power targets, route provides grade
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

  private static buildSessionContract(
    input: RecordingConfigInput,
    capabilities: RecordingCapabilities,
  ): RecordingSessionContract {
    const hasPlan = this.hasPlan(input);
    const hasStructuredPlan = input.plan?.hasStructure ?? false;
    const hasRoute = this.hasRoute(input);
    const hasRouteGeometry = this.hasRouteGeometry(input);
    const hasTrainer = Boolean(input.devices.ftmsTrainer);
    const trainerControllable = Boolean(input.devices.ftmsTrainer?.controlReady);
    const routeMode = this.determineRouteMode(input, capabilities);
    const backdropMode = this.determineBackdropMode(input, capabilities, routeMode);
    const degraded = this.determineDegradedState(input);
    const insightCards = this.determineInsightCards({
      hasStructuredPlan,
      hasRouteGeometry,
      trainerControllable,
    });
    const quickActions = this.determineQuickActions({
      hasPlan,
      hasRoute,
      hasTrainer,
    });
    const defaultPrimarySurface = this.determinePrimarySurface({
      hasStructuredPlan,
      hasRouteGeometry,
      trainerControllable,
      routeMode,
    });
    const availablePrimarySurfaces = this.determineAvailableSurfaces({
      hasStructuredPlan,
      hasRouteGeometry,
      hasTrainer,
    });
    const identityLocked = input.session?.identityLocked ?? false;

    return {
      authority: {
        category: hasPlan ? "plan" : "user",
        structure: hasPlan ? "plan" : "none",
        spatial: hasRoute ? "route" : "none",
        locationCapture: "gps",
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
        gpsIntent: input.gpsRecordingEnabled ? "on" : "off",
        gpsAvailable: input.gpsAvailable,
      },
      degraded,
      ui: {
        backdropMode,
        floatingPanel: {
          defaultCard: insightCards[0] ?? "metrics",
          availableCards: insightCards,
          forcedExpanded: !hasRoute && !input.gpsRecordingEnabled,
          canMinimize: hasRoute || input.gpsRecordingEnabled,
        },
        controls: {
          quickActions,
        },
      },
      editing: {
        canEditActivity: !identityLocked && !hasPlan,
        canEditPlan: true,
        canEditRoute: true,
        canEditGps: !identityLocked,
        locksIdentityAfterStart: true,
      },
      metrics: {
        primaryMetric: capabilities.primaryMetric,
        emphasizedMetrics: this.determineEmphasizedMetrics(input, capabilities),
      },
      surfaces: {
        defaultPrimarySurface,
        availablePrimarySurfaces,
        quickActions,
      },
      validation: {
        consequences: this.determineConsequences(input, capabilities, routeMode),
      },
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
    if (isStepBasedActivity(input.activityCategory)) return "reps";
    if (computed.canTrackPower) return "power";
    if (computed.canTrackLocation) return "distance";
    return "time";
  }

  private static determineRouteMode(
    input: RecordingConfigInput,
    capabilities: Pick<RecordingCapabilities, "canTrackLocation">,
  ) {
    if (!this.hasRoute(input)) {
      return "none" as const;
    }

    if (!this.hasRouteGeometry(input)) {
      return "unavailable" as const;
    }

    if (capabilities.canTrackLocation) {
      return "live_navigation" as const;
    }

    if (input.gpsRecordingEnabled && !input.gpsAvailable) {
      return "preview" as const;
    }

    return "virtual" as const;
  }

  private static determineBackdropMode(
    input: RecordingConfigInput,
    capabilities: Pick<RecordingCapabilities, "canTrackLocation">,
    routeMode: "none" | "preview" | "virtual" | "live_navigation" | "unavailable",
  ): RecordingBackdropMode {
    if (routeMode === "live_navigation") {
      return "live_navigation";
    }

    if (routeMode === "virtual") {
      return "virtual_route";
    }

    if (routeMode === "preview") {
      return "route_preview";
    }

    if (routeMode === "unavailable") {
      return "route_unavailable";
    }

    if (input.gpsRecordingEnabled && capabilities.canTrackLocation) {
      return "gps_map";
    }

    if (input.gpsRecordingEnabled && !input.gpsAvailable) {
      return "gps_unavailable";
    }

    return "ambient";
  }

  private static determineInsightCards(params: {
    hasStructuredPlan: boolean;
    hasRouteGeometry: boolean;
    trainerControllable: boolean;
  }): RecordingInsightCard[] {
    const cards: RecordingInsightCard[] = [];

    if (params.hasStructuredPlan) {
      cards.push("workout_interval");
    }

    if (params.hasRouteGeometry) {
      cards.push("route_progress");
    }

    if (params.trainerControllable) {
      cards.push("trainer");
    }

    cards.push("metrics");

    return Array.from(new Set(cards));
  }

  private static determinePrimarySurface(params: {
    hasStructuredPlan: boolean;
    hasRouteGeometry: boolean;
    trainerControllable: boolean;
    routeMode: "none" | "preview" | "virtual" | "live_navigation" | "unavailable";
  }): RecordingPrimarySurface {
    if (params.hasStructuredPlan) {
      return "workout";
    }

    if (params.hasRouteGeometry && params.routeMode !== "none") {
      return "route";
    }

    if (params.trainerControllable) {
      return "trainer";
    }

    return "metrics";
  }

  private static determineAvailableSurfaces(params: {
    hasStructuredPlan: boolean;
    hasRouteGeometry: boolean;
    hasTrainer: boolean;
  }): RecordingPrimarySurface[] {
    const surfaces: RecordingPrimarySurface[] = ["metrics"];

    if (params.hasStructuredPlan) {
      surfaces.unshift("workout");
    }

    if (params.hasRouteGeometry) {
      surfaces.push("route");
    }

    if (params.hasTrainer) {
      surfaces.push("trainer");
    }

    return surfaces;
  }

  private static determineQuickActions(params: {
    hasPlan: boolean;
    hasRoute: boolean;
    hasTrainer: boolean;
  }): RecordingQuickAction[] {
    const actions: RecordingQuickAction[] = ["gps", "sensors"];

    if (!params.hasPlan) {
      actions.unshift("activity");
    }

    actions.push("plan");
    actions.push("route");

    if (params.hasTrainer) {
      actions.push("trainer");
    }

    return actions;
  }

  private static determineEmphasizedMetrics(
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
  }

  private static determineConsequences(
    input: RecordingConfigInput,
    capabilities: Pick<RecordingCapabilities, "canTrackLocation" | "shouldAutoFollowTargets">,
    routeMode: "none" | "preview" | "virtual" | "live_navigation" | "unavailable",
  ): string[] {
    const consequences: string[] = [];

    if (this.hasPlan(input)) {
      consequences.push("Attached plan owns workout structure for this session.");
    }

    if (this.hasPlan(input)) {
      consequences.push("Activity identity locks after recording starts.");
    }

    if (routeMode === "virtual") {
      consequences.push(
        "Attached route will be used for virtual guidance only while GPS stays off.",
      );
    }

    if (routeMode === "preview") {
      consequences.push("Attached route is available for preview, but live navigation needs GPS.");
    }

    if (routeMode === "live_navigation" && capabilities.canTrackLocation) {
      consequences.push("Attached route can provide live route guidance during recording.");
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
  }

  private static hasPlan(input: RecordingConfigInput) {
    return (
      input.mode === "planned" ||
      (input.activityPlanId !== null && input.activityPlanId !== undefined)
    );
  }

  private static hasRoute(input: RecordingConfigInput) {
    return Boolean(input.plan?.hasRoute || input.routeId);
  }

  private static hasRouteGeometry(input: RecordingConfigInput) {
    const hasRoute = this.hasRoute(input);
    if (!hasRoute) return false;

    return input.routeGeometryAvailable ?? true;
  }

  private static determineDegradedState(
    input: RecordingConfigInput,
  ): RecordingSessionContract["degraded"] {
    const degraded: RecordingSessionContract["degraded"] = {};

    if (this.hasRoute(input) && !this.hasRouteGeometry(input)) {
      degraded.route = "missing_geometry";
    }

    if (input.gpsRecordingEnabled && !input.gpsAvailable) {
      degraded.gps = "location_unavailable";
    }

    if (input.devices.ftmsTrainer && !input.devices.ftmsTrainer.controlReady) {
      degraded.trainer = "control_not_ready";
    }

    return degraded;
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

    // GPS unavailable is exposed through the session degraded state so route preview,
    // virtual, and recovery states can still render safely.
    if (input.gpsRecordingEnabled && !input.gpsAvailable) {
      warnings.push(
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
