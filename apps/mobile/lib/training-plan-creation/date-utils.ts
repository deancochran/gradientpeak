import {
  addDaysDateOnlyUtc,
  diffDateOnlyUtcDays,
  formatDateOnlyUtc,
  isValidDateOnlyUtc,
  parseDateOnlyUtc,
} from "@repo/core";

export const parseDateKey = parseDateOnlyUtc;
export const toDateKey = formatDateOnlyUtc;
export const addDaysToDateKey = addDaysDateOnlyUtc;
export const diffDateOnlyDays = diffDateOnlyUtcDays;
export const isValidDateOnly = isValidDateOnlyUtc;
