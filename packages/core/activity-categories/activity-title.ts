import type { CanonicalActivityCategory } from "../schemas/activity-category";

const formatterByTimezone = new Map<string, Intl.DateTimeFormat>();

function hourAt(startedAt: Date, timezone: string): number {
  let formatter = formatterByTimezone.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: timezone,
    });
    formatterByTimezone.set(timezone, formatter);
  }

  const hour = formatter.formatToParts(startedAt).find((part) => part.type === "hour")?.value;
  if (hour === undefined) throw new Error("Activity title hour could not be formatted");
  return Number(hour);
}

function timeOfDay(startedAt: Date, timezone: string) {
  const hour = hourAt(startedAt, timezone);
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}

/** Creates a concise completed-activity title from its local start time and primary category. */
export function completedActivityTitle(input: {
  activityCategory: CanonicalActivityCategory;
  startedAt: Date;
  timezone?: string | null;
}) {
  const category = input.activityCategory === "other" ? "activity" : input.activityCategory;
  return `${timeOfDay(input.startedAt, input.timezone || "UTC")} ${category}`;
}
