import { z } from "zod";

import {
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadAggregate,
  commonLoadAggregateSchema,
} from "./common-relative-load";

export const COMMON_LOAD_HISTORY_POLICY_VERSION = "common_load_history_v1" as const;
export const COMMON_LOAD_HISTORY_REQUIRED_DAYS = 84 as const;
export const COMMON_LOAD_HISTORY_LONG_TERM_DAYS = 42 as const;
export const COMMON_LOAD_HISTORY_RECENT_DAYS = 7 as const;

export type DailyCommonLoadObservation = {
  date: string;
  aggregate: CommonLoadAggregate;
};

const calendarDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function isCalendarDate(value: string): boolean {
  const match = calendarDatePattern.exec(value);
  if (match === null) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || month < 1 || month > 12 || day < 1) return false;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const maximumDay = daysInMonth[month - 1];
  return maximumDay !== undefined && day <= maximumDay;
}

function isPlanningTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

const calendarDateSchema = z
  .string()
  .regex(calendarDatePattern, "Expected a YYYY-MM-DD profile-local calendar date")
  .refine(isCalendarDate, "Expected a valid profile-local calendar date");

const planningTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .refine(isPlanningTimezone, "Expected a supported IANA planning timezone");

const evidenceFingerprintsSchema = z
  .array(z.string().trim().min(1))
  .min(1)
  .superRefine((fingerprints, context) => {
    if (new Set(fingerprints).size !== fingerprints.length) {
      context.addIssue({
        code: "custom",
        message: "Daily evidence fingerprints must be unique",
      });
    }
  });

const observationIdentityShape = {
  model: z.string().trim().min(1),
  version: z.string().trim().min(1),
  coverageStatus: z.enum(["complete", "partial"]).default("complete"),
};

const commonLoadHistoryObservedDaySchema = z
  .object({
    state: z.literal("observed"),
    date: calendarDateSchema,
    ...observationIdentityShape,
    aggregate: commonLoadAggregateSchema,
    evidenceFingerprints: evidenceFingerprintsSchema,
  })
  .strict();

const commonLoadHistoryKnownZeroDaySchema = z
  .object({
    state: z.literal("known_zero"),
    date: calendarDateSchema,
    ...observationIdentityShape,
    evidenceFingerprints: evidenceFingerprintsSchema,
  })
  .strict();

const commonLoadHistoryUnavailableDaySchema = z
  .object({
    state: z.literal("unavailable"),
    date: calendarDateSchema,
    ...observationIdentityShape,
    reason: z.enum([
      "source_incomplete",
      "partial_common_load",
      "common_load_unavailable",
      "stale_evidence",
    ]),
    evidenceFingerprints: z.array(z.string().trim().min(1)),
  })
  .strict();

export const commonLoadHistoryDayObservationSchema = z.discriminatedUnion("state", [
  commonLoadHistoryObservedDaySchema,
  commonLoadHistoryKnownZeroDaySchema,
  commonLoadHistoryUnavailableDaySchema,
]);

export type CommonLoadHistoryDayObservation = z.infer<typeof commonLoadHistoryDayObservationSchema>;

export const commonLoadHistoryReplayInputSchema = z
  .object({
    currentPlanningDate: calendarDateSchema,
    planningTimezone: planningTimezoneSchema,
    observations: z
      .array(commonLoadHistoryDayObservationSchema)
      .max(COMMON_LOAD_HISTORY_REQUIRED_DAYS),
  })
  .strict();

export type CommonLoadHistoryReplayInput = z.input<typeof commonLoadHistoryReplayInputSchema>;

export const commonLoadHistoryIdentitySchema = z
  .object({
    policyVersion: z.literal(COMMON_LOAD_HISTORY_POLICY_VERSION),
    planningTimezone: planningTimezoneSchema,
    startDate: calendarDateSchema,
    endDate: calendarDateSchema,
    commonLoad: z
      .object({
        model: z.literal(COMMON_RELATIVE_LOAD_MODEL),
        version: z.literal(COMMON_RELATIVE_LOAD_VERSION),
      })
      .strict(),
    evidenceFingerprints: z.array(z.string().trim().min(1)),
  })
  .strict();

export type CommonLoadHistoryIdentity = z.infer<typeof commonLoadHistoryIdentitySchema>;

export const commonLoadHistoryPointSchema = z
  .object({
    date: calendarDateSchema,
    coverageStatus: z.enum(["complete", "partial"]),
    dailyLoad: z.number().finite().nonnegative(),
    longTermLoad: z.number().finite().nonnegative(),
    recentLoad: z.number().finite().nonnegative(),
    loadBalance: z.number().finite(),
  })
  .strict();

const unavailableResultBaseShape = {
  status: z.literal("unavailable"),
  policyVersion: z.literal(COMMON_LOAD_HISTORY_POLICY_VERSION),
};

const commonLoadHistoryUnavailableResultSchema = z.discriminatedUnion("reason", [
  z
    .object({
      ...unavailableResultBaseShape,
      reason: z.literal("invalid_input"),
      context: z.object({ path: z.string(), message: z.string().min(1) }).strict(),
    })
    .strict(),
  z
    .object({
      ...unavailableResultBaseShape,
      reason: z.literal("insufficient_history"),
      context: z
        .object({
          requiredDays: z.literal(COMMON_LOAD_HISTORY_REQUIRED_DAYS),
          receivedDays: z.number().int().nonnegative(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...unavailableResultBaseShape,
      reason: z.literal("current_day_included"),
      context: z.object({ date: calendarDateSchema }).strict(),
    })
    .strict(),
  z
    .object({
      ...unavailableResultBaseShape,
      reason: z.literal("nonconsecutive_history"),
      context: z
        .object({
          observationIndex: z.number().int().nonnegative(),
          expectedDate: calendarDateSchema,
          actualDate: calendarDateSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...unavailableResultBaseShape,
      reason: z.literal("incompatible_model_version"),
      context: z
        .object({
          date: calendarDateSchema,
          expectedModel: z.literal(COMMON_RELATIVE_LOAD_MODEL),
          expectedVersion: z.literal(COMMON_RELATIVE_LOAD_VERSION),
          actualModel: z.string().min(1),
          actualVersion: z.string().min(1),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...unavailableResultBaseShape,
      reason: z.literal("incomplete_observation"),
      context: z
        .object({
          date: calendarDateSchema,
          observationState: z.enum(["observed", "unavailable"]),
          observationReason: z.string().min(1),
        })
        .strict(),
    })
    .strict(),
]);

export const commonLoadHistoryResultSchema = z.union([
  z
    .object({
      status: z.literal("available"),
      policyVersion: z.literal(COMMON_LOAD_HISTORY_POLICY_VERSION),
      coverageStatus: z.enum(["complete", "partial"]),
      identity: commonLoadHistoryIdentitySchema,
      points: z.array(commonLoadHistoryPointSchema).length(COMMON_LOAD_HISTORY_REQUIRED_DAYS),
    })
    .strict(),
  commonLoadHistoryUnavailableResultSchema,
]);

export type CommonLoadHistoryResult = z.infer<typeof commonLoadHistoryResultSchema>;

function addCalendarDays(date: string, days: number): string {
  const match = calendarDatePattern.exec(date);
  if (match === null) throw new Error("Validated calendar date expected");

  const instant = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

function unavailableResult(
  result: z.input<typeof commonLoadHistoryUnavailableResultSchema>,
): CommonLoadHistoryResult {
  return commonLoadHistoryResultSchema.parse(result);
}

/**
 * Replays exactly the complete 84-day v1 window ending on the day before the
 * supplied profile-local planning date. The recurrence is zero-seeded and does
 * not read a clock, persistence, readiness, recovery, or form state.
 */
export function replayCommonLoadHistory(
  input: CommonLoadHistoryReplayInput,
): CommonLoadHistoryResult {
  const parsed = commonLoadHistoryReplayInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return unavailableResult({
      status: "unavailable",
      policyVersion: COMMON_LOAD_HISTORY_POLICY_VERSION,
      reason: "invalid_input",
      context: {
        path: issue?.path.map(String).join(".") ?? "",
        message: issue?.message ?? "Invalid common Load history input",
      },
    });
  }

  const observations = [...parsed.data.observations].sort((left, right) =>
    left.date.localeCompare(right.date),
  );

  const incompatible = observations.find(
    (observation) =>
      observation.model !== COMMON_RELATIVE_LOAD_MODEL ||
      observation.version !== COMMON_RELATIVE_LOAD_VERSION,
  );
  if (incompatible !== undefined) {
    return unavailableResult({
      status: "unavailable",
      policyVersion: COMMON_LOAD_HISTORY_POLICY_VERSION,
      reason: "incompatible_model_version",
      context: {
        date: incompatible.date,
        expectedModel: COMMON_RELATIVE_LOAD_MODEL,
        expectedVersion: COMMON_RELATIVE_LOAD_VERSION,
        actualModel: incompatible.model,
        actualVersion: incompatible.version,
      },
    });
  }

  if (observations.length < COMMON_LOAD_HISTORY_REQUIRED_DAYS) {
    return unavailableResult({
      status: "unavailable",
      policyVersion: COMMON_LOAD_HISTORY_POLICY_VERSION,
      reason: "insufficient_history",
      context: {
        requiredDays: COMMON_LOAD_HISTORY_REQUIRED_DAYS,
        receivedDays: observations.length,
      },
    });
  }

  if (observations.some((observation) => observation.date === parsed.data.currentPlanningDate)) {
    return unavailableResult({
      status: "unavailable",
      policyVersion: COMMON_LOAD_HISTORY_POLICY_VERSION,
      reason: "current_day_included",
      context: { date: parsed.data.currentPlanningDate },
    });
  }

  const startDate = addCalendarDays(
    parsed.data.currentPlanningDate,
    -COMMON_LOAD_HISTORY_REQUIRED_DAYS,
  );
  const endDate = addCalendarDays(parsed.data.currentPlanningDate, -1);
  for (const [index, observation] of observations.entries()) {
    const expectedDate = addCalendarDays(startDate, index);
    if (observation.date !== expectedDate) {
      return unavailableResult({
        status: "unavailable",
        policyVersion: COMMON_LOAD_HISTORY_POLICY_VERSION,
        reason: "nonconsecutive_history",
        context: { observationIndex: index, expectedDate, actualDate: observation.date },
      });
    }
  }

  for (const observation of observations) {
    if (observation.state === "unavailable") {
      return unavailableResult({
        status: "unavailable",
        policyVersion: COMMON_LOAD_HISTORY_POLICY_VERSION,
        reason: "incomplete_observation",
        context: {
          date: observation.date,
          observationState: observation.state,
          observationReason: observation.reason,
        },
      });
    }
  }

  const longTermAlpha = 1 - Math.exp(-1 / COMMON_LOAD_HISTORY_LONG_TERM_DAYS);
  const recentAlpha = 1 - Math.exp(-1 / COMMON_LOAD_HISTORY_RECENT_DAYS);
  let longTermLoad = 0;
  let recentLoad = 0;
  let coverageStatus: "complete" | "partial" = "complete";
  const points = observations.map((observation) => {
    if (observation.coverageStatus === "partial") coverageStatus = "partial";
    let dailyLoad: number;
    if (observation.state === "known_zero") {
      dailyLoad = 0;
    } else if (observation.state === "observed" && observation.aggregate.status !== "unavailable") {
      dailyLoad = observation.aggregate.load;
      if (observation.aggregate.status === "partial") coverageStatus = "partial";
    } else {
      throw new Error("Complete common Load history observation expected");
    }
    longTermLoad += longTermAlpha * (dailyLoad - longTermLoad);
    recentLoad += recentAlpha * (dailyLoad - recentLoad);
    return {
      date: observation.date,
      coverageStatus:
        observation.coverageStatus === "partial" ||
        (observation.state === "observed" && observation.aggregate.status === "partial")
          ? "partial"
          : "complete",
      dailyLoad,
      longTermLoad,
      recentLoad,
      loadBalance: longTermLoad - recentLoad,
    };
  });

  const identity = {
    policyVersion: COMMON_LOAD_HISTORY_POLICY_VERSION,
    planningTimezone: parsed.data.planningTimezone,
    startDate,
    endDate,
    commonLoad: {
      model: COMMON_RELATIVE_LOAD_MODEL,
      version: COMMON_RELATIVE_LOAD_VERSION,
    },
    evidenceFingerprints: observations.flatMap((observation) =>
      [...observation.evidenceFingerprints].sort((left, right) => left.localeCompare(right)),
    ),
  };

  return commonLoadHistoryResultSchema.parse({
    status: "available",
    policyVersion: COMMON_LOAD_HISTORY_POLICY_VERSION,
    coverageStatus,
    identity,
    points,
  });
}
