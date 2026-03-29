import {
  addDaysToDateKey,
  addMonthsToDateKey,
  type CalendarMode,
  getEndOfMonthKey,
  getNaturalAnchorForMode,
  getStartOfMonthKey,
} from "./dateMath";

export type CalendarQueryWindow = {
  rangeStart: string;
  rangeEnd: string;
};

const DAY_WINDOW_PAST = 14;
const DAY_WINDOW_FUTURE = 45;
const DAY_WINDOW_EXTENSION = 14;
const MONTH_WINDOW_PAST = 2;
const MONTH_WINDOW_FUTURE = 4;
const MONTH_WINDOW_EXTENSION = 1;

export function buildCalendarQueryWindow(
  anchorDate: string,
  mode: CalendarMode,
): CalendarQueryWindow {
  if (mode === "month") {
    const monthStart = getStartOfMonthKey(anchorDate);
    return {
      rangeStart: getStartOfMonthKey(addMonthsToDateKey(monthStart, -MONTH_WINDOW_PAST)),
      rangeEnd: getEndOfMonthKey(addMonthsToDateKey(monthStart, MONTH_WINDOW_FUTURE)),
    };
  }

  const dayAnchor = getNaturalAnchorForMode(anchorDate, "day");
  return {
    rangeStart: addDaysToDateKey(dayAnchor, -DAY_WINDOW_PAST),
    rangeEnd: addDaysToDateKey(dayAnchor, DAY_WINDOW_FUTURE),
  };
}

export function ensureCalendarQueryWindowCovers(input: {
  rangeStart: string;
  rangeEnd: string;
  anchorDate: string;
  mode: CalendarMode;
}): CalendarQueryWindow {
  const { anchorDate, mode } = input;
  let { rangeStart, rangeEnd } = input;

  if (mode === "month") {
    const monthStart = getStartOfMonthKey(anchorDate);
    if (
      monthStart <= getStartOfMonthKey(addMonthsToDateKey(rangeStart, MONTH_WINDOW_EXTENSION - 1))
    ) {
      rangeStart = getStartOfMonthKey(addMonthsToDateKey(rangeStart, -MONTH_WINDOW_EXTENSION));
    }
    if (
      monthStart >= getStartOfMonthKey(addMonthsToDateKey(rangeEnd, -MONTH_WINDOW_EXTENSION + 1))
    ) {
      rangeEnd = getEndOfMonthKey(addMonthsToDateKey(rangeEnd, MONTH_WINDOW_EXTENSION));
    }
    return { rangeStart, rangeEnd };
  }

  if (anchorDate <= addDaysToDateKey(rangeStart, DAY_WINDOW_EXTENSION)) {
    rangeStart = addDaysToDateKey(rangeStart, -DAY_WINDOW_EXTENSION);
  }
  if (anchorDate >= addDaysToDateKey(rangeEnd, -DAY_WINDOW_EXTENSION)) {
    rangeEnd = addDaysToDateKey(rangeEnd, DAY_WINDOW_EXTENSION);
  }

  return { rangeStart, rangeEnd };
}
