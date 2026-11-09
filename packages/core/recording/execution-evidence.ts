import { z } from "zod";

export const realRecordingExecutionSchema = z
  .object({ mode: z.literal("recording"), evidence: z.literal("real") })
  .strict();
export const simulationExecutionSchema = z
  .object({ mode: z.literal("simulation"), evidence: z.literal("synthetic") })
  .strict();
export const playbackExecutionSchema = z
  .object({ mode: z.literal("playback"), evidence: z.literal("persisted") })
  .strict();
export const executionEvidenceSchema = z.discriminatedUnion("mode", [
  realRecordingExecutionSchema,
  simulationExecutionSchema,
  playbackExecutionSchema,
]);
export const SIMULATION_EXECUTION = Object.freeze(
  simulationExecutionSchema.parse({ mode: "simulation", evidence: "synthetic" }),
);
export const PLAYBACK_EXECUTION = Object.freeze(
  playbackExecutionSchema.parse({ mode: "playback", evidence: "persisted" }),
);

/** Absence is a legacy real-client contract, never permission to accept an
 * explicit synthetic/replay context. Measurement provenance is validated separately. */
export function assertRealRecordingExecution(value: unknown): void {
  if (
    typeof value !== "object" ||
    value === null ||
    !("execution" in value) ||
    value.execution === undefined
  )
    return;
  if (!realRecordingExecutionSchema.safeParse(value.execution).success)
    throw new Error("Simulation or playback evidence cannot enter real recording persistence.");
}
