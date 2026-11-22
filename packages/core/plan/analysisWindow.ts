import { z } from "zod";
import { dateOnlySchema } from "../schemas/date-only";
import { addDaysDateOnlyUtc, diffDateOnlyUtcDays, parseDateOnlyUtc } from "./dateOnlyUtc";

/** Shared Plan analysis periods, ordered from the narrowest to the widest window. */
export const PLAN_ANALYSIS_WINDOW_PERIODS = ["6w", "3m", "6m", "1y"] as const;
export const PLAN_ANALYSIS_WINDOW_MAX_DAYS = 366 as const;

export const planAnalysisWindowPeriodSchema = z.enum(PLAN_ANALYSIS_WINDOW_PERIODS);
export type PlanAnalysisWindowPeriod = z.infer<typeof planAnalysisWindowPeriodSchema>;

export const planAnalysisWindowSchema = z
  .object({
    period: planAnalysisWindowPeriodSchema,
    anchorDate: dateOnlySchema,
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    inclusiveDayCount: z.number().int().positive().max(PLAN_ANALYSIS_WINDOW_MAX_DAYS),
  })
  .strict()
  .superRefine((window, context) => {
    if (window.startDate > window.anchorDate || window.anchorDate > window.endDate) {
      context.addIssue({
        code: "custom",
        message: "The anchor date must fall inside the analysis window",
        path: ["anchorDate"],
      });
    }

    const inclusiveDayCount = diffDateOnlyUtcDays(window.startDate, window.endDate) + 1;
    if (inclusiveDayCount !== window.inclusiveDayCount) {
      context.addIssue({
        code: "custom",
        message: "inclusiveDayCount must match the inclusive calendar-date range",
        path: ["inclusiveDayCount"],
      });
    }
  });

export type PlanAnalysisWindow = z.infer<typeof planAnalysisWindowSchema>;

const buildWindowInputSchema = z
  .object({
    anchorDate: dateOnlySchema,
    period: planAnalysisWindowPeriodSchema,
  })
  .strict();

const shiftWindowInputSchema = buildWindowInputSchema
  .extend({ direction: z.union([z.literal(-1), z.literal(1)]) })
  .strict();

function shiftCalendarMonths(value: string, months: number): string {
  const shifted = parseDateOnlyUtc(value);
  const day = shifted.getUTCDate();
  shifted.setUTCDate(1);
  shifted.setUTCMonth(shifted.getUTCMonth() + months);
  const targetMonth = shifted.getUTCMonth();
  shifted.setUTCMonth(targetMonth + 1, 0);
  const targetMonthEnd = shifted.getUTCDate();
  shifted.setUTCMonth(targetMonth, Math.min(day, targetMonthEnd));
  return dateOnlySchema.parse(shifted.toISOString().slice(0, 10));
}

function shiftCalendarPeriod(
  value: string,
  period: PlanAnalysisWindowPeriod,
  direction: -1 | 1,
): string {
  switch (period) {
    case "6w":
      return addDaysDateOnlyUtc(value, 42 * direction);
    case "3m":
      return shiftCalendarMonths(value, 3 * direction);
    case "6m":
      return shiftCalendarMonths(value, 6 * direction);
    case "1y":
      return shiftCalendarMonths(value, 12 * direction);
  }
}

/**
 * Builds an inclusive calendar-date window whose anchor is as close to the
 * midpoint as the period permits. If two windows are equally centered, the
 * extra day is placed after the anchor. Month and year periods retain calendar
 * semantics by ending one day before the same date one period after the start.
 */
export function buildCenteredPlanAnalysisWindow(
  input: z.input<typeof buildWindowInputSchema>,
): PlanAnalysisWindow {
  const { anchorDate, period } = buildWindowInputSchema.parse(input);
  let best:
    | {
        startDate: string;
        endDate: string;
        inclusiveDayCount: number;
        imbalance: number;
        daysBefore: number;
      }
    | undefined;

  for (let daysBefore = 0; daysBefore < PLAN_ANALYSIS_WINDOW_MAX_DAYS; daysBefore += 1) {
    const startDate = addDaysDateOnlyUtc(anchorDate, -daysBefore);
    const endDate = addDaysDateOnlyUtc(shiftCalendarPeriod(startDate, period, 1), -1);
    if (endDate < anchorDate) continue;

    const inclusiveDayCount = diffDateOnlyUtcDays(startDate, endDate) + 1;
    if (inclusiveDayCount > PLAN_ANALYSIS_WINDOW_MAX_DAYS) continue;

    const daysAfter = diffDateOnlyUtcDays(anchorDate, endDate);
    const imbalance = Math.abs(daysBefore - daysAfter);
    const isBetter =
      !best ||
      imbalance < best.imbalance ||
      (imbalance === best.imbalance &&
        daysBefore <= daysAfter &&
        best.daysBefore > diffDateOnlyUtcDays(anchorDate, best.endDate));

    if (isBetter) {
      best = { startDate, endDate, inclusiveDayCount, imbalance, daysBefore };
    }
  }

  if (!best) {
    throw new Error("Unable to build a bounded Plan analysis window");
  }

  return planAnalysisWindowSchema.parse({
    period,
    anchorDate,
    startDate: best.startDate,
    endDate: best.endDate,
    inclusiveDayCount: best.inclusiveDayCount,
  });
}

/** Moves the anchor by one complete selected period and rebuilds a centered window. */
export function shiftPlanAnalysisWindow(
  input: z.input<typeof shiftWindowInputSchema>,
): PlanAnalysisWindow {
  const { anchorDate, period, direction } = shiftWindowInputSchema.parse(input);
  return buildCenteredPlanAnalysisWindow({
    anchorDate: shiftCalendarPeriod(anchorDate, period, direction),
    period,
  });
}
