import { endOfScheduledDateToIsoInstant, formatIsoInstantInIanaZone } from "@repo/core/calendar";

export function formatRecurrenceUntil(date: string, timezone: string) {
  return endOfScheduledDateToIsoInstant({ scheduledDate: date, timeZone: timezone })
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function recurrenceEndDate(rule: string | null | undefined, timezone = "UTC") {
  const match = rule
    ?.toUpperCase()
    .match(/(?:^|;)UNTIL=(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z)?(?:;|$)/);
  if (!match) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  if (!match[4]) return date;
  return formatIsoInstantInIanaZone(`${date}T${match[4]}:${match[5]}:${match[6]}Z`, timezone).slice(
    0,
    10,
  );
}
