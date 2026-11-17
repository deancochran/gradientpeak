import { describe, expect, it } from "vitest";
import { activityPlanStructureSchema } from "../../activity-plan";
import { createUnavailableAthletePerformanceTargetFacts } from "../../performance-model";
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
  it("normalizes every recording configuration to GPS-free", () => {
    const enabledAndAvailable = RecordingConfigResolver.resolve(
      buildInput({ gpsRecordingEnabled: true, gpsAvailable: true }),
    );
    const enabledButUnavailable = RecordingConfigResolver.resolve(
      buildInput({ gpsRecordingEnabled: true, gpsAvailable: false }),
    );
    const disabledAndAvailable = RecordingConfigResolver.resolve(
      buildInput({ gpsRecordingEnabled: false, gpsAvailable: true }),
    );
    expect(enabledAndAvailable.capabilities.canTrackLocation).toBe(false);
    expect(enabledButUnavailable.capabilities.canTrackLocation).toBe(false);
    expect(disabledAndAvailable.capabilities.canTrackLocation).toBe(false);
    expect(enabledAndAvailable.input).toMatchObject({
      gpsRecordingEnabled: false,
      gpsAvailable: false,
    });
    expect(enabledAndAvailable.session.authority.locationCapture).toBe("none");
    expect(enabledAndAvailable.session.ui.controls.quickActions).not.toContain("gps");
  });
  it("does not create location warnings or controls from legacy GPS input", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({ gpsRecordingEnabled: true, gpsAvailable: false }),
    );
    expect(config.capabilities.isValid).toBe(true);
    expect(config.capabilities.errors).toHaveLength(0);
    expect(config.capabilities.warnings).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/GPS|location/i)]),
    );
    expect(config.session.devices.gpsIntent).toBe("off");
    expect(config.session.degraded.gps).toBeUndefined();
    expect(config.session.ui.backdropMode).toBe("ambient");
  });
  it("does not require GPS when GPS recording is disabled", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({ gpsRecordingEnabled: false, gpsAvailable: false }),
    );
    expect(config.capabilities.isValid).toBe(true);
    expect(config.capabilities.errors).toHaveLength(0);
  });
  it("never enables route overlay or turn-by-turn location guidance", () => {
    const withGpsAndRoute = RecordingConfigResolver.resolve(
      buildInput({
        gpsRecordingEnabled: true,
        gpsAvailable: true,
        routeId: "route-1",
        plan: {
          hasStructure: true,
          stepCount: 3,
          requiresManualAdvance: false,
        },
      }),
    );
    const withoutGpsTracking = RecordingConfigResolver.resolve(
      buildInput({
        gpsRecordingEnabled: false,
        gpsAvailable: true,
        routeId: "route-1",
        plan: {
          hasStructure: true,
          stepCount: 3,
          requiresManualAdvance: false,
        },
      }),
    );
    expect(withGpsAndRoute.capabilities.shouldShowRouteOverlay).toBe(false);
    expect(withGpsAndRoute.capabilities.shouldShowTurnByTurn).toBe(false);
    expect(withoutGpsTracking.capabilities.shouldShowRouteOverlay).toBe(false);
    expect(withoutGpsTracking.capabilities.shouldShowTurnByTurn).toBe(false);
    expect(withoutGpsTracking.session.guidance.routeMode).toBe("virtual");
  });
  it("defaults structured planned sessions to the activity surface", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({
        mode: "planned",
        activityPlanId: "plan-1",
        plan: {
          hasStructure: true,
          stepCount: 6,
          requiresManualAdvance: false,
        },
        routeId: "route-1",
        gpsRecordingEnabled: true,
        gpsAvailable: true,
      }),
    );
    expect(config.session.authority.activity_category).toBe("plan");
    expect(config.session.surfaces.defaultPrimarySurface).toBe("activity");
    expect(config.session.surfaces.availablePrimarySurfaces).toContain("activity");
    expect(config.session.surfaces.availablePrimarySurfaces).toContain("route");
    expect(config.session.surfaces.quickActions).toContain("sensors");
    expect(config.session.surfaces.quickActions).not.toContain("sources");
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
          stepCount: 4,
          requiresManualAdvance: false,
        },
      }),
    );
    expect(freeSession.session.authority.activity_category).toBe("user");
    expect(freeSession.session.editing.canEditActivity).toBe(true);
    expect(freeSession.session.surfaces.quickActions).toContain("activity");
    expect(planLedSession.session.authority.activity_category).toBe("plan");
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
    expect(live.session.guidance.routeMode).toBe("virtual");
    expect(live.session.guidance.hasRouteGeometry).toBe(true);
    expect(live.session.surfaces.availablePrimarySurfaces).toContain("route");
    expect(live.session.surfaces.defaultPrimarySurface).toBe("route");
    expect(live.session.validation.consequences).toContain(
      "Attached route will use sensor or manual distance without capturing location.",
    );
    expect(virtual.session.guidance.routeMode).toBe("virtual");
    expect(virtual.session.surfaces.availablePrimarySurfaces).toContain("route");
    expect(virtual.session.surfaces.defaultPrimarySurface).toBe("route");
    expect(virtual.session.validation.consequences).toContain(
      "Attached route will use sensor or manual distance without capturing location.",
    );
    expect(preview.session.guidance.routeMode).toBe("virtual");
    expect(preview.session.surfaces.availablePrimarySurfaces).toContain("route");
    expect(preview.session.surfaces.defaultPrimarySurface).toBe("route");
    expect(preview.session.validation.consequences).toContain(
      "Attached route will use sensor or manual distance without capturing location.",
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
    expect(gpsMap.session.ui.backdropMode).toBe("ambient");
    expect(gpsMap.session.ui.floatingPanel.forcedExpanded).toBe(true);
    expect(gpsMap.session.ui.floatingPanel.canMinimize).toBe(false);
    expect(liveRoute.session.ui.backdropMode).toBe("virtual_route");
    expect(liveRoute.session.ui.floatingPanel.canMinimize).toBe(false);
    expect(virtualRoute.session.ui.backdropMode).toBe("virtual_route");
    expect(virtualRoute.session.ui.floatingPanel.forcedExpanded).toBe(true);
    expect(virtualRoute.session.ui.floatingPanel.canMinimize).toBe(false);
    expect(routePreview.session.ui.backdropMode).toBe("virtual_route");
    expect(routePreview.session.ui.floatingPanel.forcedExpanded).toBe(true);
    expect(routePreview.session.ui.floatingPanel.canMinimize).toBe(false);
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
  it("keeps a static virtual route valid without location availability", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({
        routeId: "route-1",
        routeGeometryAvailable: true,
        gpsRecordingEnabled: true,
        gpsAvailable: false,
      }),
    );
    expect(config.capabilities.isValid).toBe(true);
    expect(config.session.guidance.routeMode).toBe("virtual");
    expect(config.session.ui.backdropMode).toBe("virtual_route");
    expect(config.session.degraded.gps).toBeUndefined();
  });
  it("ignores legacy GPS mode input without losing unrelated route capability", () => {
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
    expect(routeGpsOn.session.guidance.routeMode).toBe("virtual");
    expect(routeGpsOn.session.ui.backdropMode).toBe("virtual_route");
    expect(routeGpsOn.session.ui.floatingPanel.availableCards).toContain("route_progress");
    expect(routeGpsOff.session.guidance.routeMode).toBe("virtual");
    expect(routeGpsOff.session.ui.backdropMode).toBe("virtual_route");
    expect(routeGpsOff.session.devices.gpsIntent).toBe("off");
    expect(routeGpsOff.session.ui.floatingPanel.availableCards).toContain("route_progress");
    expect(routeGpsOff.session.ui.floatingPanel.forcedExpanded).toBe(true);
    expect(routeGpsOff.session.ui.floatingPanel.canMinimize).toBe(false);
    expect(routeGpsDenied.session.guidance.routeMode).toBe("virtual");
    expect(routeGpsDenied.session.ui.backdropMode).toBe("virtual_route");
    expect(routeGpsDenied.session.degraded.gps).toBeUndefined();
    expect(routeGpsDenied.session.ui.floatingPanel.availableCards).toContain("route_progress");
    expect(routeGpsDenied.session.ui.floatingPanel.forcedExpanded).toBe(true);
    expect(routeGpsDenied.session.ui.floatingPanel.canMinimize).toBe(false);
    expect(routeDetachedGpsOn.session.guidance.routeMode).toBe("none");
    expect(routeDetachedGpsOn.session.ui.backdropMode).toBe("ambient");
    expect(routeDetachedGpsOn.session.ui.floatingPanel.availableCards).toEqual(["metrics"]);
    expect(routeDetachedGpsOff.session.guidance.routeMode).toBe("none");
    expect(routeDetachedGpsOff.session.ui.backdropMode).toBe("ambient");
    expect(routeDetachedGpsOff.session.ui.floatingPanel.availableCards).toEqual(["metrics"]);
  });
  it("orders insight cards around activity, route, trainer, then metrics fallback", () => {
    const plannedRouteTrainer = RecordingConfigResolver.resolve(
      buildInput({
        mode: "planned",
        activityPlanId: "plan-1",
        routeId: "route-1",
        plan: {
          hasStructure: true,
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
    expect(plannedRouteTrainer.session.ui.floatingPanel.defaultCard).toBe("activity_interval");
    expect(plannedRouteTrainer.session.ui.floatingPanel.availableCards).toEqual([
      "activity_interval",
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
    expect(config.session.guidance.routeMode).toBe("virtual");
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
  it("prioritizes structured plan targets over route simulation for automatic trainer control", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({
        activityCategory: "bike",
        mode: "planned",
        activityPlanId: "plan-1",
        routeId: "route-1",
        plan: {
          hasStructure: true,
          stepCount: 1,
          requiresManualAdvance: false,
          structure: activityPlanStructureSchema.parse({
            version: 5,
            activity_category: "bike",
            items: [
              {
                type: "step",
                id: "22222222-2222-4222-8222-222222222222",
                name: "Tempo",
                duration: { type: "time", seconds: 600 },
                targets: [{ type: "watts", intensity: 250 }],
              },
            ],
          }),
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
    expect(config.capabilities.shouldAutoFollowTargets).toBe(true);
    expect(config.capabilities.autoFollowPriority).toBe("plan_targets");
    expect(config.capabilities.autoFollowConflict).toBe(true);
    expect(config.capabilities.warnings).toContain(
      "Structured plan targets take priority over route simulation for automatic trainer control.",
    );
  });
  it("uses route simulation auto-follow when the structured plan has no trainer-controllable targets", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({
        activityCategory: "bike",
        mode: "planned",
        activityPlanId: "plan-1",
        routeId: "route-1",
        plan: {
          hasStructure: true,
          stepCount: 1,
          requiresManualAdvance: false,
          structure: {
            version: 3,
            activity_category: "bike",
            segments: [
              {
                role: "activity",
                id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                name: "Bike",
                intervals: [
                  {
                    id: "33333333-3333-4333-8333-333333333333",
                    name: "Main",
                    repetitions: 1,
                    steps: [
                      {
                        type: "step",
                        id: "44444444-4444-4444-8444-444444444444",
                        name: "Steady",
                        duration: { type: "time", seconds: 600 },
                        targets: [{ type: "bpm", intensity: 150 }],
                      },
                    ],
                  },
                ],
              },
            ],
          } as never,
        },
        devices: {
          ftmsTrainer: {
            deviceId: "trainer-1",
            autoControlEnabled: true,
            controlReady: true,
          },
          hasPowerMeter: false,
          hasHeartRateMonitor: true,
          hasCadenceSensor: false,
        },
      }),
    );
    expect(config.capabilities.shouldAutoFollowTargets).toBe(true);
    expect(config.capabilities.autoFollowPriority).toBe("route_simulation");
    expect(config.capabilities.autoFollowConflict).toBe(false);
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
          stepCount: 3,
          requiresManualAdvance: false,
        },
      }),
    );
    expect(config.session.guidance.routeMode).toBe("virtual");
    expect(config.session.validation.consequences).toContain(
      "Attached route will use sensor or manual distance without capturing location.",
    );
  });
  it("keeps time primary when legacy GPS input is supplied", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({ gpsRecordingEnabled: true, gpsAvailable: true }),
    );
    expect(config.capabilities.primaryMetric).toBe("time");
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
  it("keeps trainer support independent from rejected GPS input", () => {
    const config = RecordingConfigResolver.resolve(
      buildInput({
        activityCategory: "bike",
        gpsRecordingEnabled: true,
        gpsAvailable: true,
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
    expect(config.capabilities.canTrackPower).toBe(true);
    expect(config.capabilities.shouldShowTrainerControl).toBe(true);
    expect(config.capabilities.shouldAutoFollowTargets).toBe(false);
    expect(config.capabilities.primaryMetric).toBe("power");
    expect(config.session.devices.hasTrainer).toBe(true);
    expect(config.session.devices.trainerControllable).toBe(true);
    expect(config.session.ui.floatingPanel.availableCards).toContain("trainer");
    expect(config.session.surfaces.quickActions).toContain("trainer");
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
      gpsMode: "off",
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
    expect(config.session.surfaces.defaultPrimarySurface).toBe("activity");
  });
  it("resolves configuration from a session snapshot", () => {
    const snapshot: RecordingSessionSnapshot = {
      identity: {
        sessionId: "session-1",
        revision: 1,
        startedAt: "2026-03-20T10:00:00Z",
      },
      activity: {
        activity_category: "bike",
        mode: "planned",
        gpsMode: "off",
        eventId: null,
        activityPlanId: "550e8400-e29b-41d4-a716-446655440000",
        routeId: null,
      },
      profileSnapshot: {},
      performanceTargets: createUnavailableAthletePerformanceTargetFacts(
        "2026-03-20T10:00:00.000Z",
      ),
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
        autoFollowPriority: "plan_targets",
        autoFollowConflict: false,
        autoFollowConflictReason: null,
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
    const detachedPlanConfig = RecordingConfigResolver.resolveFromSessionSnapshot(snapshot, {
      activityPlanId: null,
      routeId: null,
    });
    expect(detachedPlanConfig.input.activityPlanId).toBeNull();
    expect(detachedPlanConfig.input.mode).toBe("unplanned");
    expect(detachedPlanConfig.session.guidance.hasPlan).toBe(false);
    expect(detachedPlanConfig.session.ui.floatingPanel.availableCards).not.toContain(
      "activity_interval",
    );
  });
});
