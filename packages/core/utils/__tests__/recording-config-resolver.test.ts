import { describe, expect, it } from "vitest";
import type { RecordingConfigInput } from "../../schemas/recording_config";
import type {
  RecordingLaunchIntent,
  RecordingSessionSnapshot,
} from "../../schemas/recording-session";
import { RecordingConfigResolver } from "../recording-config-resolver";

function buildInput(overrides: Partial<RecordingConfigInput> = {}): RecordingConfigInput {
  return {
    activityCategory: "run",
    gpsRecordingEnabled: false,
    mode: "unplanned",
    devices: {
      hasPowerMeter: false,
      hasHeartRateMonitor: false,
      hasCadenceSensor: false,
    },
    gpsAvailable: false,
    ...overrides,
  };
}

describe("RecordingConfigResolver", () => {
  it("tracks location only when GPS intent and availability are true", () => {
    const enabledAndAvailable = RecordingConfigResolver.resolve(
      buildInput({ gpsRecordingEnabled: true, gpsAvailable: true }),
    );
    const enabledButUnavailable = RecordingConfigResolver.resolve(
      buildInput({ gpsRecordingEnabled: true, gpsAvailable: false }),
    );
    const disabledAndAvailable = RecordingConfigResolver.resolve(
      buildInput({ gpsRecordingEnabled: false, gpsAvailable: true }),
    );

    expect(enabledAndAvailable.capabilities.canTrackLocation).toBe(true);
    expect(enabledButUnavailable.capabilities.canTrackLocation).toBe(false);
    expect(disabledAndAvailable.capabilities.canTrackLocation).toBe(false);
  });

  it("degrades when GPS recording is enabled but unavailable", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({ gpsRecordingEnabled: true, gpsAvailable: false }),
    );

    expect(config.capabilities.isValid).toBe(true);
    expect(config.capabilities.errors).toHaveLength(0);
    expect(config.capabilities.warnings).toContain(
      "GPS recording is enabled, but GPS is unavailable. Please enable location services.",
    );
    expect(config.session.devices.gpsIntent).toBe("on");
    expect(config.session.degraded.gps).toBe("location_unavailable");
    expect(config.session.ui.backdropMode).toBe("gps_unavailable");
  });

  it("does not require GPS when GPS recording is disabled", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({ gpsRecordingEnabled: false, gpsAvailable: false }),
    );

    expect(config.capabilities.isValid).toBe(true);
    expect(config.capabilities.errors).toHaveLength(0);
  });

  it("gates route overlay and turn-by-turn by GPS tracking and route", () => {
    const withGpsAndRoute = RecordingConfigResolver.resolve(
      buildInput({
        gpsRecordingEnabled: true,
        gpsAvailable: true,
        plan: {
          hasStructure: true,
          hasRoute: true,
          stepCount: 3,
          requiresManualAdvance: false,
        },
      }),
    );
    const withoutGpsTracking = RecordingConfigResolver.resolve(
      buildInput({
        gpsRecordingEnabled: false,
        gpsAvailable: true,
        plan: {
          hasStructure: true,
          hasRoute: true,
          stepCount: 3,
          requiresManualAdvance: false,
        },
      }),
    );

    expect(withGpsAndRoute.capabilities.shouldShowRouteOverlay).toBe(true);
    expect(withGpsAndRoute.capabilities.shouldShowTurnByTurn).toBe(true);
    expect(withoutGpsTracking.capabilities.shouldShowRouteOverlay).toBe(false);
    expect(withoutGpsTracking.capabilities.shouldShowTurnByTurn).toBe(false);
    expect(withoutGpsTracking.session.guidance.routeMode).toBe("virtual");
  });

  it("defaults structured planned sessions to the workout surface", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({
        mode: "planned",
        activityPlanId: "plan-1",
        plan: {
          hasStructure: true,
          hasRoute: true,
          stepCount: 6,
          requiresManualAdvance: false,
        },
        routeId: "route-1",
        gpsRecordingEnabled: true,
        gpsAvailable: true,
      }),
    );

    expect(config.session.authority.category).toBe("plan");
    expect(config.session.surfaces.defaultPrimarySurface).toBe("workout");
    expect(config.session.surfaces.availablePrimarySurfaces).toContain("workout");
    expect(config.session.surfaces.availablePrimarySurfaces).toContain("route");
    expect(config.session.surfaces.quickActions).toContain("sensors");
    expect(config.session.surfaces.quickActions).not.toContain("sources" as any);
    expect(config.session.editing.canEditActivity).toBe(false);
  });

  it("allows activity edits for free sessions and locks activity edits for plan-led sessions", () => {
    const freeSession = RecordingConfigResolver.resolve(
      buildInput({ mode: "unplanned", activityPlanId: null }),
    );
    const planLedSession = RecordingConfigResolver.resolve(
      buildInput({
        mode: "planned",
        activityPlanId: "plan-1",
        plan: {
          hasStructure: true,
          hasRoute: false,
          stepCount: 4,
          requiresManualAdvance: false,
        },
      }),
    );

    expect(freeSession.session.authority.category).toBe("user");
    expect(freeSession.session.editing.canEditActivity).toBe(true);
    expect(freeSession.session.surfaces.quickActions).toContain("activity");

    expect(planLedSession.session.authority.category).toBe("plan");
    expect(planLedSession.session.editing.canEditActivity).toBe(false);
    expect(planLedSession.session.surfaces.quickActions).not.toContain("activity");
    expect(planLedSession.session.editing.locksIdentityAfterStart).toBe(true);
  });

  it("keeps identity locked while allowing plan and route adjustments after start", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({
        mode: "unplanned",
        activityPlanId: null,
        routeId: "route-1",
        gpsRecordingEnabled: true,
        gpsAvailable: true,
        session: { identityLocked: true },
      }),
    );

    expect(config.session.editing.canEditActivity).toBe(false);
    expect(config.session.editing.canEditPlan).toBe(true);
    expect(config.session.editing.canEditRoute).toBe(true);
    expect(config.session.editing.canEditGps).toBe(false);
  });

  it("derives route mode and route surface availability from route and GPS state", () => {
    const none = RecordingConfigResolver.resolve(buildInput());
    const live = RecordingConfigResolver.resolve(
      buildInput({ routeId: "route-1", gpsRecordingEnabled: true, gpsAvailable: true }),
    );
    const virtual = RecordingConfigResolver.resolve(
      buildInput({ routeId: "route-1", gpsRecordingEnabled: false, gpsAvailable: true }),
    );
    const preview = RecordingConfigResolver.resolve(
      buildInput({ routeId: "route-1", gpsRecordingEnabled: true, gpsAvailable: false }),
    );

    expect(none.session.guidance.routeMode).toBe("none");
    expect(none.session.guidance.hasRouteGeometry).toBe(false);
    expect(none.session.surfaces.availablePrimarySurfaces).not.toContain("route");
    expect(none.session.surfaces.defaultPrimarySurface).toBe("metrics");

    expect(live.session.guidance.routeMode).toBe("live_navigation");
    expect(live.session.guidance.hasRouteGeometry).toBe(true);
    expect(live.session.surfaces.availablePrimarySurfaces).toContain("route");
    expect(live.session.surfaces.defaultPrimarySurface).toBe("route");
    expect(live.session.validation.consequences).toContain(
      "Attached route can provide live route guidance during recording.",
    );

    expect(virtual.session.guidance.routeMode).toBe("virtual");
    expect(virtual.session.surfaces.availablePrimarySurfaces).toContain("route");
    expect(virtual.session.surfaces.defaultPrimarySurface).toBe("route");
    expect(virtual.session.validation.consequences).toContain(
      "Attached route will be used for virtual guidance only while GPS stays off.",
    );

    expect(preview.session.guidance.routeMode).toBe("preview");
    expect(preview.session.surfaces.availablePrimarySurfaces).toContain("route");
    expect(preview.session.surfaces.defaultPrimarySurface).toBe("route");
    expect(preview.session.validation.consequences).toContain(
      "Attached route is available for preview, but live navigation needs GPS.",
    );
  });

  it("derives cockpit backdrop and floating panel behavior from route and GPS state", () => {
    const ambient = RecordingConfigResolver.resolve(
      buildInput({ gpsRecordingEnabled: false, gpsAvailable: false }),
    );
    const gpsMap = RecordingConfigResolver.resolve(
      buildInput({ gpsRecordingEnabled: true, gpsAvailable: true }),
    );
    const liveRoute = RecordingConfigResolver.resolve(
      buildInput({ routeId: "route-1", gpsRecordingEnabled: true, gpsAvailable: true }),
    );
    const virtualRoute = RecordingConfigResolver.resolve(
      buildInput({ routeId: "route-1", gpsRecordingEnabled: false, gpsAvailable: true }),
    );
    const routePreview = RecordingConfigResolver.resolve(
      buildInput({ routeId: "route-1", gpsRecordingEnabled: true, gpsAvailable: false }),
    );

    expect(ambient.session.ui.backdropMode).toBe("ambient");
    expect(ambient.session.ui.floatingPanel.forcedExpanded).toBe(true);
    expect(ambient.session.ui.floatingPanel.canMinimize).toBe(false);

    expect(gpsMap.session.ui.backdropMode).toBe("gps_map");
    expect(gpsMap.session.ui.floatingPanel.forcedExpanded).toBe(false);
    expect(gpsMap.session.ui.floatingPanel.canMinimize).toBe(true);

    expect(liveRoute.session.ui.backdropMode).toBe("live_navigation");
    expect(liveRoute.session.ui.floatingPanel.canMinimize).toBe(true);

    expect(virtualRoute.session.ui.backdropMode).toBe("virtual_route");
    expect(virtualRoute.session.ui.floatingPanel.canMinimize).toBe(true);

    expect(routePreview.session.ui.backdropMode).toBe("route_preview");
    expect(routePreview.session.ui.floatingPanel.canMinimize).toBe(true);
  });

  it("represents attached routes without geometry as unavailable", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({
        routeId: "route-1",
        routeGeometryAvailable: false,
        gpsRecordingEnabled: false,
        gpsAvailable: true,
      }),
    );

    expect(config.session.guidance.hasRoute).toBe(true);
    expect(config.session.guidance.hasRouteGeometry).toBe(false);
    expect(config.session.guidance.routeMode).toBe("unavailable");
    expect(config.session.ui.backdropMode).toBe("route_unavailable");
    expect(config.session.degraded.route).toBe("missing_geometry");
    expect(config.session.ui.floatingPanel.availableCards).toEqual(["metrics"]);
    expect(config.session.surfaces.availablePrimarySurfaces).not.toContain("route");
  });

  it("keeps route preview valid when GPS is unavailable but geometry exists", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({
        routeId: "route-1",
        routeGeometryAvailable: true,
        gpsRecordingEnabled: true,
        gpsAvailable: false,
      }),
    );

    expect(config.capabilities.isValid).toBe(true);
    expect(config.session.guidance.routeMode).toBe("preview");
    expect(config.session.ui.backdropMode).toBe("route_preview");
    expect(config.session.degraded.gps).toBe("location_unavailable");
  });

  it("transitions route and GPS modes without losing unrelated session capability", () => {
    const routeGpsOn = RecordingConfigResolver.resolve(
      buildInput({
        routeId: "route-1",
        routeGeometryAvailable: true,
        gpsRecordingEnabled: true,
        gpsAvailable: true,
      }),
    );
    const routeGpsOff = RecordingConfigResolver.resolve(
      buildInput({
        routeId: "route-1",
        routeGeometryAvailable: true,
        gpsRecordingEnabled: false,
        gpsAvailable: true,
      }),
    );
    const routeGpsDenied = RecordingConfigResolver.resolve(
      buildInput({
        routeId: "route-1",
        routeGeometryAvailable: true,
        gpsRecordingEnabled: true,
        gpsAvailable: false,
      }),
    );
    const routeDetachedGpsOn = RecordingConfigResolver.resolve(
      buildInput({
        gpsRecordingEnabled: true,
        gpsAvailable: true,
      }),
    );
    const routeDetachedGpsOff = RecordingConfigResolver.resolve(
      buildInput({
        gpsRecordingEnabled: false,
        gpsAvailable: false,
      }),
    );

    expect(routeGpsOn.session.guidance.routeMode).toBe("live_navigation");
    expect(routeGpsOn.session.ui.backdropMode).toBe("live_navigation");
    expect(routeGpsOn.session.ui.floatingPanel.availableCards).toContain("route_progress");

    expect(routeGpsOff.session.guidance.routeMode).toBe("virtual");
    expect(routeGpsOff.session.ui.backdropMode).toBe("virtual_route");
    expect(routeGpsOff.session.devices.gpsIntent).toBe("off");
    expect(routeGpsOff.session.ui.floatingPanel.availableCards).toContain("route_progress");

    expect(routeGpsDenied.session.guidance.routeMode).toBe("preview");
    expect(routeGpsDenied.session.ui.backdropMode).toBe("route_preview");
    expect(routeGpsDenied.session.degraded.gps).toBe("location_unavailable");
    expect(routeGpsDenied.session.ui.floatingPanel.availableCards).toContain("route_progress");

    expect(routeDetachedGpsOn.session.guidance.routeMode).toBe("none");
    expect(routeDetachedGpsOn.session.ui.backdropMode).toBe("gps_map");
    expect(routeDetachedGpsOn.session.ui.floatingPanel.availableCards).toEqual(["metrics"]);

    expect(routeDetachedGpsOff.session.guidance.routeMode).toBe("none");
    expect(routeDetachedGpsOff.session.ui.backdropMode).toBe("ambient");
    expect(routeDetachedGpsOff.session.ui.floatingPanel.availableCards).toEqual(["metrics"]);
  });

  it("orders insight cards around workout, route, trainer, then metrics fallback", () => {
    const plannedRouteTrainer = RecordingConfigResolver.resolve(
      buildInput({
        mode: "planned",
        activityPlanId: "plan-1",
        routeId: "route-1",
        plan: {
          hasStructure: true,
          hasRoute: true,
          stepCount: 4,
          requiresManualAdvance: false,
        },
        devices: {
          ftmsTrainer: {
            deviceId: "trainer-1",
            autoControlEnabled: true,
            controlReady: true,
          },
          hasPowerMeter: false,
          hasHeartRateMonitor: false,
          hasCadenceSensor: false,
        },
      }),
    );

    expect(plannedRouteTrainer.session.ui.floatingPanel.defaultCard).toBe("workout_interval");
    expect(plannedRouteTrainer.session.ui.floatingPanel.availableCards).toEqual([
      "workout_interval",
      "route_progress",
      "trainer",
      "metrics",
    ]);
    expect(plannedRouteTrainer.session.ui.controls.quickActions).toEqual(
      plannedRouteTrainer.session.surfaces.quickActions,
    );
  });

  it("defaults route-led free sessions to the route surface", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({
        routeId: "route-1",
        gpsRecordingEnabled: true,
        gpsAvailable: true,
      }),
    );

    expect(config.session.guidance.routeMode).toBe("live_navigation");
    expect(config.session.surfaces.defaultPrimarySurface).toBe("route");
    expect(config.session.surfaces.availablePrimarySurfaces).toContain("route");
  });

  it("defaults trainer-only free sessions to the trainer surface", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({
        activityCategory: "bike",
        devices: {
          ftmsTrainer: {
            deviceId: "trainer-1",
            autoControlEnabled: false,
            controlReady: true,
          },
          hasPowerMeter: false,
          hasHeartRateMonitor: false,
          hasCadenceSensor: false,
        },
      }),
    );

    expect(config.session.devices.hasTrainer).toBe(true);
    expect(config.session.surfaces.defaultPrimarySurface).toBe("trainer");
    expect(config.session.surfaces.availablePrimarySurfaces).toContain("trainer");
    expect(config.session.ui.floatingPanel.availableCards).toContain("trainer");
  });

  it("distinguishes trainer presence from trainer control readiness", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({
        activityCategory: "bike",
        devices: {
          ftmsTrainer: {
            deviceId: "trainer-1",
            autoControlEnabled: true,
            controlReady: false,
          },
          hasPowerMeter: false,
          hasHeartRateMonitor: false,
          hasCadenceSensor: false,
        },
      }),
    );

    expect(config.session.devices.hasTrainer).toBe(true);
    expect(config.session.devices.trainerControllable).toBe(false);
    expect(config.session.degraded.trainer).toBe("control_not_ready");
    expect(config.capabilities.shouldShowTrainerControl).toBe(false);
    expect(config.session.surfaces.defaultPrimarySurface).toBe("metrics");
    expect(config.session.ui.floatingPanel.availableCards).not.toContain("trainer");
  });

  it("adds plain-language consequences for virtual route sessions", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({
        mode: "planned",
        activityPlanId: "plan-1",
        routeId: "route-1",
        gpsRecordingEnabled: false,
        gpsAvailable: true,
        plan: {
          hasStructure: true,
          hasRoute: true,
          stepCount: 3,
          requiresManualAdvance: false,
        },
      }),
    );

    expect(config.session.guidance.routeMode).toBe("virtual");
    expect(config.session.validation.consequences).toContain(
      "Attached route will be used for virtual guidance only while GPS stays off.",
    );
  });

  it("uses distance as primary metric when GPS tracking is active", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({ gpsRecordingEnabled: true, gpsAvailable: true }),
    );

    expect(config.capabilities.primaryMetric).toBe("distance");
  });

  it("prioritizes power metric when power is available", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({
        activityCategory: "bike",
        devices: {
          hasPowerMeter: true,
          hasHeartRateMonitor: false,
          hasCadenceSensor: false,
        },
      }),
    );

    expect(config.capabilities.primaryMetric).toBe("power");
  });

  it("uses reps as primary metric for strength", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({
        activityCategory: "strength",
        gpsRecordingEnabled: true,
        gpsAvailable: true,
        devices: {
          hasPowerMeter: true,
          hasHeartRateMonitor: false,
          hasCadenceSensor: false,
        },
      }),
    );

    expect(config.capabilities.primaryMetric).toBe("reps");
  });

  it("resolves configuration from a launch intent", () => {
    const intent: RecordingLaunchIntent = {
      activityCategory: "bike",
      mode: "planned",
      gpsMode: "on",
      eventId: null,
      activityPlanId: "550e8400-e29b-41d4-a716-446655440000",
      routeId: "550e8400-e29b-41d4-a716-446655440001",
      sourcePreferences: [],
      controlPolicy: {
        trainerMode: "auto",
        autoAdvanceSteps: true,
      },
    };

    const config = RecordingConfigResolver.resolveFromLaunchIntent(intent, {
      launchSource: "activity_plan",
      plan: {
        hasStructure: true,
        hasRoute: true,
        stepCount: 4,
        requiresManualAdvance: false,
      },
      devices: {
        ftmsTrainer: {
          deviceId: "trainer-1",
          autoControlEnabled: true,
          controlReady: true,
        },
        hasPowerMeter: false,
        hasHeartRateMonitor: true,
        hasCadenceSensor: true,
      },
      gpsAvailable: true,
    });

    expect(config.input.mode).toBe("planned");
    expect(config.input.launchSource).toBe("activity_plan");
    expect(config.capabilities.shouldShowTrainerControl).toBe(true);
    expect(config.capabilities.shouldAutoFollowTargets).toBe(true);
    expect(config.session.surfaces.defaultPrimarySurface).toBe("workout");
  });

  it("resolves configuration from a session snapshot", () => {
    const snapshot: RecordingSessionSnapshot = {
      identity: {
        sessionId: "session-1",
        revision: 1,
        startedAt: "2026-03-20T10:00:00Z",
      },
      activity: {
        category: "bike",
        mode: "planned",
        gpsMode: "off",
        eventId: null,
        activityPlanId: "550e8400-e29b-41d4-a716-446655440000",
        routeId: null,
      },
      profileSnapshot: {
        defaultsApplied: [],
      },
      devices: {
        connected: [
          {
            deviceId: "power-meter-1",
            role: "power_meter",
            sourceTypes: ["power_meter"],
            controllable: false,
          },
          {
            deviceId: "trainer-1",
            role: "trainer",
            sourceTypes: ["trainer_power", "trainer_cadence"],
            controllable: true,
          },
        ],
        controllableTrainer: {
          deviceId: "trainer-1",
          sourceTypes: ["trainer_power", "trainer_cadence"],
          supportsAutoControl: true,
          supportsManualControl: true,
        },
        selectedSources: [],
      },
      capabilities: {
        canTrackLocation: false,
        canTrackPower: true,
        canTrackHeartRate: false,
        canTrackCadence: false,
        shouldShowMap: false,
        shouldShowSteps: true,
        shouldShowRouteOverlay: false,
        shouldShowTurnByTurn: false,
        shouldShowFollowAlong: false,
        shouldShowTrainerControl: true,
        canAutoAdvanceSteps: true,
        shouldAutoFollowTargets: true,
        primaryMetric: "power",
        isValid: true,
        errors: [],
        warnings: [],
      },
      policies: {
        sourcePolicy: {
          preferUserSelection: true,
          allowDerivedSpeed: true,
          allowDerivedDistance: true,
        },
        controlPolicy: {
          trainerMode: "auto",
          autoAdvanceSteps: true,
        },
        degradedModePolicy: {
          allowWithoutGps: true,
          allowWithoutSensors: true,
          exposeSourceWarnings: true,
        },
      },
    };

    const config = RecordingConfigResolver.resolveFromSessionSnapshot(snapshot);

    expect(config.input.gpsRecordingEnabled).toBe(false);
    expect(config.input.devices.ftmsTrainer?.deviceId).toBe("trainer-1");
    expect(config.input.devices.hasPowerMeter).toBe(true);
    expect(config.capabilities.primaryMetric).toBe("power");
    expect(config.session.surfaces.availablePrimarySurfaces).toContain("trainer");
  });
});
