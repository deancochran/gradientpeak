type IcalProperty = {
  value: string;
  params: Record<string, string>;
};

export type ParsedIcalEvent = {
  uid: string;
  summary: string | null;
  description: string | null;
  dtstart: IcalProperty;
  dtend: IcalProperty | null;
  recurrenceId: IcalProperty | null;
  rrule: string | null;
  status: string | null;
};

type ParsedDateValue = {
  iso: string;
  allDay: boolean;
  key: string;
  timezone: string;
};

function unfoldIcalLines(icsText: string): string[] {
  const lines = icsText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const unfolded: string[] = [];

  for (const line of lines) {
    if (
      (line.startsWith(" ") || line.startsWith("\t")) &&
      unfolded.length > 0
    ) {
      unfolded[unfolded.length - 1] += line.slice(1);
      continue;
    }

    unfolded.push(line);
  }

  return unfolded;
}

function parsePropertyLine(line: string): {
  name: string;
  value: string;
  params: Record<string, string>;
} | null {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex <= 0) return null;

  const left = line.slice(0, separatorIndex);
  const value = line.slice(separatorIndex + 1);
  const [namePart, ...paramParts] = left.split(";");
  const name = (namePart || "").trim().toUpperCase();
  if (!name) return null;

  const params: Record<string, string> = {};
  for (const param of paramParts) {
    const [rawKey, ...rest] = param.split("=");
    const key = (rawKey || "").trim().toUpperCase();
    if (!key) continue;
    params[key] = rest.join("=").trim();
  }

  return { name, value, params };
}

export function parseIcalEvents(icsText: string): ParsedIcalEvent[] {
  const lines = unfoldIcalLines(icsText);
  const parsedEvents: ParsedIcalEvent[] = [];

  let current: Partial<Record<string, IcalProperty>> | null = null;

  for (const line of lines) {
    const upperLine = line.toUpperCase();
    if (upperLine === "BEGIN:VEVENT") {
      current = {};
      continue;
    }

    if (upperLine === "END:VEVENT") {
      if (!current) continue;
      const uid = current.UID?.value?.trim();
      const dtstart = current.DTSTART;

      if (uid && dtstart) {
        parsedEvents.push({
          uid,
          summary: current.SUMMARY?.value ?? null,
          description: current.DESCRIPTION?.value ?? null,
          dtstart,
          dtend: current.DTEND ?? null,
          recurrenceId: current["RECURRENCE-ID"] ?? null,
          rrule: current.RRULE?.value ?? null,
          status: current.STATUS?.value ?? null,
        });
      }

      current = null;
      continue;
    }

    if (!current) continue;
    const parsed = parsePropertyLine(line);
    if (!parsed) continue;

    current[parsed.name] = {
      value: parsed.value,
      params: parsed.params,
    };
  }

  return parsedEvents;
}

function decodeIcalText(value: string | null): string | null {
  if (!value) return null;

  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseDateValueParts(value: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  isUtc: boolean;
} {
  const normalized = value.trim().toUpperCase();
  const compact = normalized.replace(/[-:]/g, "");
  const isUtc = compact.endsWith("Z");
  const core = isUtc ? compact.slice(0, -1) : compact;

  const [datePart, timePart] = core.split("T");
  const year = Number(datePart?.slice(0, 4));
  const month = Number(datePart?.slice(4, 6));
  const day = Number(datePart?.slice(6, 8));

  const hour = Number(timePart?.slice(0, 2) ?? "0");
  const minute = Number(timePart?.slice(2, 4) ?? "0");
  const second = Number(timePart?.slice(4, 6) ?? "0");

  return { year, month, day, hour, minute, second, isUtc };
}

function toUtcIsoFromTimezone(params: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  timezone: string;
}): string {
  const { year, month, day, hour, minute, second, timezone } = params;
  const utcCandidate = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second),
  );

  try {
    const tzLocalText = utcCandidate.toLocaleString("en-US", {
      timeZone: timezone,
      hour12: false,
    });
    const tzLocalDate = new Date(tzLocalText);
    const offsetMs = utcCandidate.getTime() - tzLocalDate.getTime();
    return new Date(utcCandidate.getTime() + offsetMs).toISOString();
  } catch {
    return utcCandidate.toISOString();
  }
}

export function parseIcalDateValue(
  property: IcalProperty,
  fallbackTimezone = "UTC",
): ParsedDateValue {
  const rawValue = property.value.trim();
  const isDateOnly =
    property.params.VALUE?.toUpperCase() === "DATE" || /^\d{8}$/.test(rawValue);

  if (isDateOnly) {
    const year = Number(rawValue.slice(0, 4));
    const month = Number(rawValue.slice(4, 6));
    const day = Number(rawValue.slice(6, 8));
    const iso = new Date(Date.UTC(year, month - 1, day, 0, 0, 0)).toISOString();
    const key = `${rawValue.slice(0, 4)}-${rawValue.slice(4, 6)}-${rawValue.slice(6, 8)}`;

    return {
      iso,
      allDay: true,
      key,
      timezone: "UTC",
    };
  }

  const parts = parseDateValueParts(rawValue);
  const tzid = property.params.TZID || fallbackTimezone;

  let iso: string;
  if (parts.isUtc) {
    iso = new Date(
      Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
      ),
    ).toISOString();
  } else if (property.params.TZID) {
    iso = toUtcIsoFromTimezone({
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: parts.hour,
      minute: parts.minute,
      second: parts.second,
      timezone: property.params.TZID,
    });
  } else {
    iso = new Date(
      Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
      ),
    ).toISOString();
  }

  return {
    iso,
    allDay: false,
    key: iso,
    timezone: tzid || "UTC",
  };
}

export type NormalizedIcalEvent = {
  externalEventId: string;
  occurrenceKey: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  timezone: string;
  recurrenceRule: string | null;
  recurrenceTimezone: string | null;
  status: "scheduled" | "cancelled";
};

export function normalizeIcalEvent(
  event: ParsedIcalEvent,
): NormalizedIcalEvent {
  const starts = parseIcalDateValue(event.dtstart, "UTC");
  const recurrenceDate = event.recurrenceId
    ? parseIcalDateValue(event.recurrenceId, starts.timezone)
    : null;

  let endsAt: string | null = null;
  if (event.dtend) {
    endsAt = parseIcalDateValue(event.dtend, starts.timezone).iso;
  } else if (starts.allDay) {
    const startDate = new Date(starts.iso);
    startDate.setUTCDate(startDate.getUTCDate() + 1);
    endsAt = startDate.toISOString();
  }

  const normalizedStatus =
    event.status?.trim().toUpperCase() === "CANCELLED"
      ? "cancelled"
      : "scheduled";

  return {
    externalEventId: event.uid,
    occurrenceKey: recurrenceDate?.key ?? starts.key,
    title: decodeIcalText(event.summary) || "Imported Event",
    description: decodeIcalText(event.description),
    startsAt: starts.iso,
    endsAt,
    allDay: starts.allDay,
    timezone: starts.timezone || "UTC",
    recurrenceRule: event.rrule?.trim() || null,
    recurrenceTimezone: event.dtstart.params.TZID || null,
    status: normalizedStatus,
  };
}
