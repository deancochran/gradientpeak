import { describe, expect, it } from "vitest";
import { activityPlanStructureSchema } from "../activity-plan/structure-schema";
import { createSimulationDefinition, createSimulationState, reduceSimulation } from "./simulation";
import { indexSimulationRoute, simulationPositionAt } from "./simulation-route";

function plan() {
  const structure = activityPlanStructureSchema.parse({
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "30000000-0000-4000-8000-000000000001",
        name: "Time",
        duration: { type: "time", seconds: 10 },
        targets: [{ type: "RPE", intensity: 5 }],
      },
      {
        type: "step",
        id: "30000000-0000-4000-8000-000000000002",
        name: "Distance",
        duration: { type: "distance", meters: 100 },
        targets: [{ type: "RPE", intensity: 5 }],
      },
      {
        type: "step",
        id: "30000000-0000-4000-8000-000000000003",
        name: "Reps",
        duration: { type: "repetitions", count: 12 },
        targets: [{ type: "RPE", intensity: 5 }],
      },
      {
        type: "step",
        id: "30000000-0000-4000-8000-000000000004",
        name: "Open",
        duration: { type: "untilFinished" },
        targets: [{ type: "RPE", intensity: 5 }],
      },
    ],
  });
  return {
    manifestVersion: 2,
    personalizationEnabled: false,
    targetPresentations: [],
    activityPlanId: "40000000-0000-4000-8000-000000000001",
    activityPlanRevision: 3,
    scheduledEventId: null,
    compilerVersion: 3,
    name: "Canonical",
    description: null,
    structureHash: `v1:sha256:${"a".repeat(64)}`,
    structure,
  };
}
const assumptions = { virtualSpeedMps: 10, clockMultiplier: 1 };
describe("synthetic route indexing", () => {
  it("uses full geometry and crosses the antimeridian via the short arc", () => {
    const route = indexSimulationRoute([
      { latitude: 0, longitude: 179.9, altitude: 100 },
      { latitude: 0, longitude: -179.9, altitude: 120 },
    ]);
    expect(route.totalDistanceMeters).toBeCloseTo(22238.985, 1);
    const middle = simulationPositionAt(route, route.totalDistanceMeters / 2);
    expect(Math.abs(middle?.longitude ?? 0)).toBeCloseTo(180);
    expect(middle?.elevationMeters).toBeCloseTo(110);
    expect(middle?.gradePercent).toBeCloseTo((20 / route.totalDistanceMeters) * 100);
    expect(middle?.execution).toEqual({ mode: "simulation", evidence: "synthetic" });
    expect(simulationPositionAt(route, 1e9)).toMatchObject({
      longitude: -179.9,
      routeEnded: true,
      distanceMeters: route.totalDistanceMeters,
      gradePercent: null,
    });
  });
  it("keeps missing heights unknown and removes zero-distance duplicate edges without division by zero", () => {
    const route = indexSimulationRoute([
      { latitude: 40, longitude: -74, altitude: 100 },
      { latitude: 40, longitude: -74 },
      { latitude: 40.001, longitude: -74, altitude: 110 },
    ]);
    expect(route.duplicatesRemoved).toBe(1);
    expect(simulationPositionAt(route, route.totalDistanceMeters / 2)).toMatchObject({
      elevationMeters: null,
      gradePercent: null,
    });
    expect(simulationPositionAt(route, -1)).toMatchObject({
      latitude: 40,
      longitude: -74,
      elevationMeters: null,
    });
    expect(simulationPositionAt(indexSimulationRoute([]), 0)).toBeNull();
    expect(() => indexSimulationRoute([{ latitude: NaN, longitude: 0 }])).toThrow();
    expect(() =>
      indexSimulationRoute([
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 180 },
      ]),
    ).toThrow("antipodal");
  });
});
describe("synthetic execution", () => {
  it("keeps fixed V5 steps moving and stops at plan completion when route distance remains", () => {
    const base = plan();
    const step = base.structure.items[0];
    if (!step || step.type !== "step") throw new Error("Expected step");
    const structure = activityPlanStructureSchema.parse({
      ...base.structure,
      items: [
        { ...step, duration: { type: "time", seconds: 1 } },
        {
          ...step,
          id: "30000000-0000-4000-8000-000000000002",
          duration: { type: "time", seconds: 2 },
        },
        {
          ...step,
          id: "30000000-0000-4000-8000-000000000003",
          duration: { type: "time", seconds: 1 },
        },
      ],
    });
    const definition = createSimulationDefinition({
      assumptions,
      planSnapshot: { ...base, structure },
      coordinates: [
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 0.01 },
      ],
    });
    const state = reduceSimulation(
      definition,
      reduceSimulation(definition, createSimulationState(definition), { type: "start" }),
      { type: "tick", wallDeltaMs: 20000 },
    );
    expect(state).toMatchObject({
      elapsedMs: 4000,
      travelMeters: 40,
      status: "finished",
      finishReason: "plan_complete",
    });
    expect(state.transitions.map((transition) => transition.travelMeters)).toEqual([10, 30, 40]);
    if (!definition.route) throw new Error("Expected route");
    expect(simulationPositionAt(definition.route, state.travelMeters)?.routeEnded).toBe(false);
    expect(reduceSimulation(definition, state, { type: "tick", wallDeltaMs: 99999 })).toBe(state);
  });
  it("conserves catch-up time across time/distance/manual steps and clamps a shorter route", () => {
    const source = plan();
    const definition = createSimulationDefinition({
      assumptions,
      planSnapshot: source,
      coordinates: [
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 0.001 },
      ],
    });
    source.name = "Changed query object";
    expect(definition.planSnapshot?.name).toBe("Canonical");
    let state = reduceSimulation(definition, createSimulationState(definition), { type: "start" });
    state = reduceSimulation(definition, state, { type: "tick", wallDeltaMs: 25000 });
    expect(state).toMatchObject({
      elapsedMs: 25000,
      travelMeters: 250,
      occurrenceIndex: 2,
      occurrenceElapsedMs: 5000,
      status: "running",
    });
    expect(state.transitions.map((transition) => transition.elapsedMs)).toEqual([10000, 20000]);
    expect(state.transitions.map((transition) => transition.occurrenceId)).toEqual(
      definition.plan?.occurrences.slice(0, 2).map((occurrence) => occurrence.occurrenceId),
    );
    if (!definition.route) throw new Error("Expected route");
    expect(simulationPositionAt(definition.route, state.travelMeters)?.routeEnded).toBe(true);
    const manual = definition.plan?.occurrences[2];
    if (!manual) throw new Error("Expected manual step");
    state = reduceSimulation(definition, state, {
      type: "complete",
      occurrenceId: manual.occurrenceId,
    });
    expect(
      reduceSimulation(definition, state, { type: "complete", occurrenceId: manual.occurrenceId }),
    ).toBe(state);
    state = reduceSimulation(definition, state, { type: "tick", wallDeltaMs: 5000 });
    const open = definition.plan?.occurrences[3];
    if (!open) throw new Error("Expected open step");
    state = reduceSimulation(definition, state, { type: "skip", occurrenceId: open.occurrenceId });
    expect(state).toMatchObject({
      elapsedMs: 30000,
      travelMeters: 300,
      status: "finished",
      finishReason: "plan_complete",
    });
    expect(state.transitions.at(-1)?.outcome).toBe("skipped");
  });
  it("does not advance while paused, applies the multiplier, and restarts without historical effects", () => {
    const definition = createSimulationDefinition({
      assumptions: { ...assumptions, clockMultiplier: 2 },
      planSnapshot: plan(),
    });
    let state = reduceSimulation(definition, createSimulationState(definition), { type: "start" });
    state = reduceSimulation(definition, state, { type: "tick", wallDeltaMs: 2500 });
    state = reduceSimulation(definition, state, { type: "pause" });
    expect(reduceSimulation(definition, state, { type: "tick", wallDeltaMs: 60000 })).toBe(state);
    state = reduceSimulation(definition, state, { type: "resume" });
    state = reduceSimulation(definition, state, { type: "tick", wallDeltaMs: 2500 });
    expect(state).toMatchObject({ elapsedMs: 10000, occurrenceIndex: 1 });
    expect(reduceSimulation(definition, state, { type: "restart" })).toMatchObject({
      status: "ready",
      elapsedMs: 0,
      travelMeters: 0,
      transitions: [],
    });
    expect(reduceSimulation(definition, state, { type: "finish" }).finishReason).toBe(
      "user_stopped",
    );
  });
  it("finishes route-only runs exactly at the route endpoint and rejects assumptions that cannot progress", () => {
    const coordinates = [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0.001 },
    ];
    const definition = createSimulationDefinition({ assumptions, coordinates });
    const state = reduceSimulation(
      definition,
      reduceSimulation(definition, createSimulationState(definition), { type: "start" }),
      { type: "tick", wallDeltaMs: 60000 },
    );
    expect(state.finishReason).toBe("route_complete");
    expect(state.travelMeters).toBe(definition.route?.totalDistanceMeters);
    expect(state.elapsedMs).toBeCloseTo((state.travelMeters / 10) * 1000);
    expect(() =>
      createSimulationDefinition({
        assumptions: { ...assumptions, virtualSpeedMps: 0 },
        coordinates,
      }),
    ).toThrow("greater than zero");
    expect(() => createSimulationDefinition({ assumptions, coordinates: [] })).toThrow(
      "no traversable",
    );
    expect(() => createSimulationDefinition({ assumptions })).toThrow("Choose");
  });
});
