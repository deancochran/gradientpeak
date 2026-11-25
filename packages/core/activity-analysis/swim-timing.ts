import { z } from "zod";

export const SWIM_TIMING_CALCULATION_VERSION = "swim-active-rest-duration-v1" as const;
export const MAX_SWIM_TIMING_LENGTHS = 1_000_000;

const swimTimingCommonShape = {
  calculationVersion: z.literal(SWIM_TIMING_CALCULATION_VERSION),
  elapsedDurationSeconds: z.number().finite().positive(),
  knownDurationSeconds: z.number().finite().nonnegative(),
  sourceLengthCount: z.number().int().nonnegative(),
  activeLengthCount: z.number().int().nonnegative(),
};

const availableSwimTimingSchema = z
  .object({
    status: z.literal("available"),
    ...swimTimingCommonShape,
    activeDurationSeconds: z.number().finite().nonnegative(),
    restDurationSeconds: z.number().finite().nonnegative(),
  })
  .strict();

const partialSwimTimingSchema = z
  .object({
    status: z.literal("partial"),
    reason: z.literal("source_incomplete"),
    ...swimTimingCommonShape,
    activeDurationSeconds: z.number().finite().nonnegative().nullable(),
    restDurationSeconds: z.number().finite().nonnegative().nullable(),
  })
  .strict();

const unavailableSwimTimingSchema = z
  .object({
    status: z.literal("unavailable"),
    reason: z.enum(["no_length_timing", "invalid_timing"]),
    ...swimTimingCommonShape,
    activeDurationSeconds: z.null(),
    restDurationSeconds: z.null(),
  })
  .strict();

export const swimTimingResultSchema = z.discriminatedUnion("status", [
  availableSwimTimingSchema,
  partialSwimTimingSchema,
  unavailableSwimTimingSchema,
]);

export type SwimTimingResult = z.infer<typeof swimTimingResultSchema>;

export interface SwimLengthTimingInput {
  lengthType?: string | null;
  totalElapsedTime?: number | null;
  totalTimerTime?: number | null;
}

function positiveFinite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function durationForLength(length: SwimLengthTimingInput, role: "active" | "rest"): number | null {
  return role === "active"
    ? (positiveFinite(length.totalTimerTime) ?? positiveFinite(length.totalElapsedTime))
    : (positiveFinite(length.totalElapsedTime) ?? positiveFinite(length.totalTimerTime));
}

function durationsEqual(left: number, right: number): boolean {
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right)) * 16;
  return Math.abs(left - right) <= tolerance;
}

/**
 * Resolves pool-length timing only. Session/provider timing precedence remains an adapter concern.
 * Active lengths contribute active time; idle/rest lengths contribute known rest time.
 */
export function calculateSwimTiming(input: {
  elapsedDurationSeconds: number;
  lengths: readonly SwimLengthTimingInput[];
  expectedActiveLengthCount?: number | null;
}): SwimTimingResult {
  if (!Number.isFinite(input.elapsedDurationSeconds) || input.elapsedDurationSeconds <= 0) {
    throw new Error("Swim elapsed duration must be finite and greater than zero");
  }
  if (input.lengths.length > MAX_SWIM_TIMING_LENGTHS) {
    throw new Error(`Swim timing is limited to ${MAX_SWIM_TIMING_LENGTHS} lengths`);
  }
  if (
    input.expectedActiveLengthCount !== undefined &&
    input.expectedActiveLengthCount !== null &&
    (!Number.isInteger(input.expectedActiveLengthCount) || input.expectedActiveLengthCount < 0)
  ) {
    throw new Error("Expected active swim length count must be a nonnegative integer");
  }

  let activeDurationSeconds = 0;
  let restDurationSeconds = 0;
  let activeLengthCount = 0;
  let sourceIncomplete = false;
  for (const length of input.lengths) {
    const role =
      length.lengthType === "active"
        ? "active"
        : length.lengthType === "idle" || length.lengthType === "rest"
          ? "rest"
          : null;
    if (role === null) {
      sourceIncomplete = true;
      continue;
    }
    if (role === "active") activeLengthCount += 1;
    const durationSeconds = durationForLength(length, role);
    if (durationSeconds === null) {
      sourceIncomplete = true;
      continue;
    }
    if (role === "active") {
      activeDurationSeconds += durationSeconds;
    } else {
      restDurationSeconds += durationSeconds;
    }
  }

  const knownDurationSeconds = activeDurationSeconds + restDurationSeconds;
  const common = {
    calculationVersion: SWIM_TIMING_CALCULATION_VERSION,
    elapsedDurationSeconds: input.elapsedDurationSeconds,
    knownDurationSeconds,
    sourceLengthCount: input.lengths.length,
    activeLengthCount,
  };
  if (
    knownDurationSeconds > input.elapsedDurationSeconds &&
    !durationsEqual(knownDurationSeconds, input.elapsedDurationSeconds)
  ) {
    return swimTimingResultSchema.parse({
      status: "unavailable",
      reason: "invalid_timing",
      ...common,
      activeDurationSeconds: null,
      restDurationSeconds: null,
    });
  }
  if (input.lengths.length === 0 || knownDurationSeconds === 0) {
    return swimTimingResultSchema.parse({
      status: "unavailable",
      reason: "no_length_timing",
      ...common,
      activeDurationSeconds: null,
      restDurationSeconds: null,
    });
  }

  const expectedCountMatches =
    input.expectedActiveLengthCount === undefined ||
    input.expectedActiveLengthCount === null ||
    input.expectedActiveLengthCount === activeLengthCount;
  const complete =
    !sourceIncomplete &&
    expectedCountMatches &&
    durationsEqual(knownDurationSeconds, input.elapsedDurationSeconds);
  if (complete) {
    return swimTimingResultSchema.parse({
      status: "available",
      ...common,
      activeDurationSeconds,
      restDurationSeconds,
    });
  }
  return swimTimingResultSchema.parse({
    status: "partial",
    reason: "source_incomplete",
    ...common,
    activeDurationSeconds: activeDurationSeconds > 0 ? activeDurationSeconds : null,
    restDurationSeconds: restDurationSeconds > 0 ? restDurationSeconds : null,
  });
}
