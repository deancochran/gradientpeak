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
/** Four long-term time constants are required before a zero initial state is mature. */
export const COMMON_LOAD_HISTORY_MATURE_DAYS = 168 as const;
const COMMON_LOAD_HISTORY_MAX_REPLAY_DAYS = 366 as const;

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
      .max(COMMON_LOAD_HISTORY_MAX_REPLAY_DAYS),
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

export const commonLoadHistoryMaturitySchema = z
  .object({
    /** A short zero-seeded replay must not be presented as an established CTL baseline. */
    status: z.enum(["establishing_baseline", "provisional", "mature"]),
    replayedDays: z.number().int().min(COMMON_LOAD_HISTORY_REQUIRED_DAYS),
    requiredMatureDays: z.literal(COMMON_LOAD_HISTORY_MATURE_DAYS),
    coverage: z
      .object({
        completeDays: z.number().int().nonnegative(),
        partialDays: z.number().int().nonnegative(),
        ratio: z.number().min(0).max(1),
      })
      .strict(),
  })
  .strict()
  .superRefine((maturity, context) => {
    if (maturity.coverage.completeDays + maturity.coverage.partialDays !== maturity.replayedDays) {
      context.addIssue({
        code: "custom",
        message: "Maturity coverage must account for every replayed day",
      });
    }
    const expectedRatio = maturity.coverage.completeDays / maturity.replayedDays;
    if (Math.abs(maturity.coverage.ratio - expectedRatio) > Number.EPSILON * 8) {
      context.addIssue({
        code: "custom",
        path: ["coverage", "ratio"],
        message: "Maturity coverage ratio must use replayed days",
      });
    }
    if (maturity.coverage.partialDays > 0 && maturity.status !== "provisional") {
      context.addIssue({ code: "custom", message: "Partial history must be marked provisional" });
    }
    if (
      maturity.coverage.partialDays === 0 &&
      maturity.replayedDays < COMMON_LOAD_HISTORY_MATURE_DAYS &&
      maturity.status !== "establishing_baseline"
    ) {
      context.addIssue({
        code: "custom",
        message: "A zero-seeded short replay is still establishing its baseline",
      });
    }
    if (
      maturity.coverage.partialDays === 0 &&
      maturity.replayedDays >= COMMON_LOAD_HISTORY_MATURE_DAYS &&
      maturity.status !== "mature"
    ) {
      context.addIssue({
        code: "custom",
        message: "Complete mature replay history must be marked mature",
      });
    }
  });

export type CommonLoadHistoryMaturity = z.infer<typeof commonLoadHistoryMaturitySchema>;

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
          observationState: z.enum(["observed", "known_zero", "unavailable"]),
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
      maturity: commonLoadHistoryMaturitySchema,
      identity: commonLoadHistoryIdentitySchema,
      // The output remains chart-bounded even when older replay history is
      // supplied solely to establish the exponential baseline.
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
 * Replays 84–366 consecutive days ending on the day before the supplied
 * profile-local planning date. It returns the latest 84 chart points while
 * replaying older supplied days to establish the exponential baseline. The
 * recurrence does not read a clock, persistence, readiness, recovery, or form state.
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

  const startDate = addCalendarDays(parsed.data.currentPlanningDate, -observations.length);
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
          observationState: "unavailable",
          observationReason: observation.reason,
        },
      });
    }
    if (observation.coverageStatus === "partial") {
      return unavailableResult({
        status: "unavailable",
        policyVersion: COMMON_LOAD_HISTORY_POLICY_VERSION,
        reason: "incomplete_observation",
        context: {
          date: observation.date,
          observationState: observation.state,
          observationReason: "partial_source_day",
        },
      });
    }
    if (observation.state === "observed" && observation.aggregate.status !== "complete") {
      return unavailableResult({
        status: "unavailable",
        policyVersion: COMMON_LOAD_HISTORY_POLICY_VERSION,
        reason: "incomplete_observation",
        context: {
          date: observation.date,
          observationState: "observed",
          observationReason:
            observation.aggregate.status === "partial"
              ? "partial_common_load"
              : "common_load_unavailable",
        },
      });
    }
  }

  const longTermAlpha = 1 - Math.exp(-1 / COMMON_LOAD_HISTORY_LONG_TERM_DAYS);
  const recentAlpha = 1 - Math.exp(-1 / COMMON_LOAD_HISTORY_RECENT_DAYS);
  let longTermLoad = 0;
  let recentLoad = 0;
  const replayedPoints = observations.map((observation) => {
    let dailyLoad: number;
    if (observation.state === "known_zero") {
      dailyLoad = 0;
    } else if (observation.state === "observed" && observation.aggregate.status === "complete") {
      dailyLoad = observation.aggregate.load;
    } else {
      throw new Error("Complete common Load history observation expected");
    }
    longTermLoad += longTermAlpha * (dailyLoad - longTermLoad);
    recentLoad += recentAlpha * (dailyLoad - recentLoad);
    return {
      date: observation.date,
      coverageStatus: "complete" as const,
      dailyLoad,
      longTermLoad,
      recentLoad,
      loadBalance: longTermLoad - recentLoad,
    };
  });

  const completeDays = observations.length;
  const maturity = {
    status:
      observations.length < COMMON_LOAD_HISTORY_MATURE_DAYS
        ? ("establishing_baseline" as const)
        : ("mature" as const),
    replayedDays: observations.length,
    requiredMatureDays: COMMON_LOAD_HISTORY_MATURE_DAYS,
    coverage: {
      completeDays,
      partialDays: 0,
      ratio: completeDays / observations.length,
    },
  };

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
    coverageStatus: "complete",
    maturity,
    identity,
    points: replayedPoints.slice(-COMMON_LOAD_HISTORY_REQUIRED_DAYS),
  });
}
