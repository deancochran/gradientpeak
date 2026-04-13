import {
  addMonthsToDateKey,
  getEndOfMonthKey,
  getMonthAnchor,
  getStartOfMonthKey,
} from "./dateMath";

export type CalendarQueryWindow = {
  rangeStart: string;
  rangeEnd: string;
};

const MONTH_WINDOW_PAST = 2;
const MONTH_WINDOW_FUTURE = 4;
const MONTH_WINDOW_EXTENSION = 1;

export function buildCalendarQueryWindow(anchorDate: string): CalendarQueryWindow {
  const monthStart = getMonthAnchor(anchorDate);
  return {
    rangeStart: getStartOfMonthKey(addMonthsToDateKey(monthStart, -MONTH_WINDOW_PAST)),
    rangeEnd: getEndOfMonthKey(addMonthsToDateKey(monthStart, MONTH_WINDOW_FUTURE)),
  };
}

export function ensureCalendarQueryWindowCovers(input: {
  rangeStart: string;
  rangeEnd: string;
  anchorDate: string;
}): CalendarQueryWindow {
  const { anchorDate } = input;
  let { rangeStart, rangeEnd } = input;

  const monthStart = getMonthAnchor(anchorDate);
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
