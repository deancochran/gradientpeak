import { z } from "zod";
import { type CompiledActivityPlan, compileActivityPlan } from "../activity-plan/compile";
import { recordingPlanExecutionSnapshotSchema } from "../schemas/recording-session";
import { SIMULATION_EXECUTION, simulationExecutionSchema } from "./execution-evidence";
import { indexSimulationRoute, type SimulationRouteIndex } from "./simulation-route";
import { advanceVirtualClock } from "./virtual-clock";

export const SIMULATION_MULTIPLIERS = [0.5, 1, 2, 4, 10, 60] as const;
export const MAX_SIMULATION_MS = 30 * 24 * 60 * 60 * 1000;
export const simulationAssumptionsSchema = z
  .object({
    virtualSpeedMps: z
      .number()
      .finite()
      .min(0)
      .max(200 / 3.6),
    clockMultiplier: z
      .number()
      .refine(
        (value) => SIMULATION_MULTIPLIERS.some((allowed) => allowed === value),
        "Choose a supported clock multiplier.",
      ),
  })
  .strict();
export const simulationStateSchema = z
  .object({
    execution: simulationExecutionSchema,
    status: z.enum(["ready", "running", "paused", "finished"]),
    elapsedMs: z.number().finite().nonnegative(),
    travelMeters: z.number().finite().nonnegative(),
    occurrenceIndex: z.number().int().nonnegative().nullable(),
    occurrenceElapsedMs: z.number().finite().nonnegative(),
    occurrenceDistanceMeters: z.number().finite().nonnegative(),
    transitions: z
      .array(
        z
          .object({
            occurrenceId: z.string(),
            outcome: z.enum(["completed", "skipped"]),
            method: z.enum(["automatic", "manual"]),
            elapsedMs: z.number(),
            travelMeters: z.number(),
          })
          .strict(),
      )
      .max(1064),
    finishReason: z
      .enum(["plan_complete", "route_complete", "user_stopped", "time_limit"])
      .nullable(),
  })
  .strict();
export type SimulationState = z.infer<typeof simulationStateSchema>;
export type SimulationDefinition = {
  execution: typeof SIMULATION_EXECUTION;
  assumptions: z.infer<typeof simulationAssumptionsSchema>;
  planSnapshot: z.infer<typeof recordingPlanExecutionSnapshotSchema> | null;
  plan: CompiledActivityPlan | null;
  route: SimulationRouteIndex | null;
};
const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tick"), wallDeltaMs: z.number().finite().nonnegative() }).strict(),
  z.object({ type: z.literal("start") }).strict(),
  z.object({ type: z.literal("pause") }).strict(),
  z.object({ type: z.literal("resume") }).strict(),
  z.object({ type: z.literal("restart") }).strict(),
  z.object({ type: z.literal("finish") }).strict(),
  z.object({ type: z.enum(["complete", "skip"]), occurrenceId: z.string() }).strict(),
]);
export type SimulationCommand = z.infer<typeof commandSchema>;

export function createSimulationDefinition(input: {
  assumptions: unknown;
  planSnapshot?: unknown;
  coordinates?: unknown;
}): SimulationDefinition {
  const assumptions = simulationAssumptionsSchema.parse(input.assumptions);
  const planSnapshot =
    input.planSnapshot === undefined || input.planSnapshot === null
      ? null
      : recordingPlanExecutionSnapshotSchema.parse(input.planSnapshot);
  const plan = planSnapshot ? compileActivityPlan(planSnapshot.structure) : null;
  const route =
    input.coordinates === undefined || input.coordinates === null
      ? null
      : indexSimulationRoute(input.coordinates);
  if (!plan && !route) throw new Error("Choose an activity plan or a route to simulate.");
  if (route && route.totalDistanceMeters <= 0)
    throw new Error("The selected route has no traversable full geometry.");
  if (
    assumptions.virtualSpeedMps === 0 &&
    ((!plan && route) ||
      plan?.occurrences.some((occurrence) => occurrence.duration.type === "distance"))
  )
    throw new Error(
      "Route-only and distance-step simulations need a virtual speed greater than zero.",
    );
  return { execution: SIMULATION_EXECUTION, assumptions, planSnapshot, plan, route };
}

export function createSimulationState(definition: SimulationDefinition): SimulationState {
  return {
    execution: SIMULATION_EXECUTION,
    status: "ready",
    elapsedMs: 0,
    travelMeters: 0,
    occurrenceIndex: definition.plan ? 0 : null,
    occurrenceElapsedMs: 0,
    occurrenceDistanceMeters: 0,
    transitions: [],
    finishReason: null,
  };
}

export function reduceSimulation(
  definition: SimulationDefinition,
  state: SimulationState,
  input: SimulationCommand,
): SimulationState {
  simulationExecutionSchema.parse(state.execution);
  simulationExecutionSchema.parse(definition.execution);
  const command = commandSchema.parse(input);
  if (command.type === "restart") return createSimulationState(definition);
  if (command.type === "start")
    return state.status === "ready" ? { ...state, status: "running" } : state;
  if (command.type === "resume")
    return state.status === "paused" ? { ...state, status: "running" } : state;
  if (command.type === "pause")
    return state.status === "running" ? { ...state, status: "paused" } : state;
  if (state.status !== "running" && state.status !== "paused") return state;
  if (command.type === "finish")
    return { ...state, status: "finished", finishReason: "user_stopped" };
  const current =
    state.occurrenceIndex === null
      ? undefined
      : definition.plan?.occurrences[state.occurrenceIndex];
  if (command.type === "complete" || command.type === "skip") {
    if (!current || current.occurrenceId !== command.occurrenceId) return state;
    if (
      command.type === "complete" &&
      current.duration.type !== "repetitions" &&
      current.duration.type !== "untilFinished"
    )
      return state;
    const next = (state.occurrenceIndex ?? 0) + 1;
    const finished = next >= (definition.plan?.occurrences.length ?? 0);
    return {
      ...state,
      occurrenceIndex: finished ? null : next,
      occurrenceElapsedMs: 0,
      occurrenceDistanceMeters: 0,
      status: finished ? "finished" : state.status,
      finishReason: finished ? "plan_complete" : null,
      transitions: [
        ...state.transitions,
        {
          occurrenceId: current.occurrenceId,
          outcome: command.type === "skip" ? "skipped" : "completed",
          method: "manual",
          elapsedMs: state.elapsedMs,
          travelMeters: state.travelMeters,
        },
      ],
    };
  }
  if (state.status !== "running" || command.type !== "tick") return state;
  let remaining = advanceVirtualClock(
    0,
    command.wallDeltaMs,
    definition.assumptions.clockMultiplier,
    MAX_SIMULATION_MS - state.elapsedMs,
  );
  let next = { ...state };
  const added: SimulationState["transitions"] = [];
  while (remaining > 0 && next.status === "running") {
    const occurrence =
      next.occurrenceIndex === null
        ? undefined
        : definition.plan?.occurrences[next.occurrenceIndex];
    const speed = definition.assumptions.virtualSpeedMps;
    const timeToBoundary =
      occurrence?.duration.type === "time"
        ? Math.max(0, occurrence.duration.seconds * 1000 - next.occurrenceElapsedMs)
        : occurrence?.duration.type === "distance"
          ? (Math.max(0, occurrence.duration.meters - next.occurrenceDistanceMeters) / speed) * 1000
          : !definition.plan && definition.route
            ? (Math.max(0, definition.route.totalDistanceMeters - next.travelMeters) / speed) * 1000
            : Infinity;
    const consumed = Math.min(remaining, timeToBoundary);
    const traveled = (speed * consumed) / 1000;
    next = {
      ...next,
      elapsedMs: next.elapsedMs + consumed,
      travelMeters: next.travelMeters + traveled,
      occurrenceElapsedMs: next.occurrenceElapsedMs + consumed,
      occurrenceDistanceMeters: next.occurrenceDistanceMeters + traveled,
    };
    remaining = Math.max(0, remaining - consumed);
    if (consumed >= timeToBoundary) {
      if (!occurrence) {
        next.status = "finished";
        next.finishReason = "route_complete";
        next.travelMeters = definition.route?.totalDistanceMeters ?? next.travelMeters;
      } else {
        added.push({
          occurrenceId: occurrence.occurrenceId,
          outcome: "completed",
          method: "automatic",
          elapsedMs: next.elapsedMs,
          travelMeters: next.travelMeters,
        });
        const index = (next.occurrenceIndex ?? 0) + 1;
        next.occurrenceIndex = index < (definition.plan?.occurrences.length ?? 0) ? index : null;
        next.occurrenceElapsedMs = 0;
        next.occurrenceDistanceMeters = 0;
        if (next.occurrenceIndex === null) {
          next.status = "finished";
          next.finishReason = "plan_complete";
        }
      }
    }
  }
  if (next.status === "running" && next.elapsedMs >= MAX_SIMULATION_MS) {
    next.status = "finished";
    next.finishReason = "time_limit";
  }
  return {
    ...next,
    transitions: added.length ? [...state.transitions, ...added] : state.transitions,
  };
}
