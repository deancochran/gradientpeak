import { z } from "zod";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isGregorianLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInGregorianMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isGregorianLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

/** A literal Gregorian calendar date, exactly formatted as `YYYY-MM-DD`. */
export const dateOnlySchema = z.string().superRefine((value, ctx) => {
  if (!DATE_ONLY_PATTERN.test(value)) {
    ctx.addIssue({ code: "custom", message: "Date must use YYYY-MM-DD format" });
    return;
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));

  if (month < 1 || month > 12 || day < 1 || day > daysInGregorianMonth(year, month)) {
    ctx.addIssue({ code: "custom", message: "Date must be a valid Gregorian calendar date" });
  }
});
