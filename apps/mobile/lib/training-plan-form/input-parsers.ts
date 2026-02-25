const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HMS_PATTERN = /^([0-9]+):([0-5][0-9]):([0-5][0-9])$/;
const MMSS_PATTERN = /^([0-9]+):([0-5][0-9])$/;

interface NumberParseOptions {
  min?: number;
  max?: number;
  decimals?: number;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampInteger(value: number, min: number, max: number): number {
  return Math.round(clampNumber(value, min, max));
}

export function parseNumberOrUndefined(
  value: string | undefined,
): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseBoundedNumber(
  value: string | undefined,
  options: NumberParseOptions = {},
): number | undefined {
  const parsed = parseNumberOrUndefined(value);
  if (parsed === undefined) {
    return undefined;
  }

  const min = options.min ?? Number.NEGATIVE_INFINITY;
  const max = options.max ?? Number.POSITIVE_INFINITY;
  const clamped = clampNumber(parsed, min, max);
  const decimals = options.decimals;
  if (decimals === undefined) {
    return clamped;
  }

  return Number(clamped.toFixed(decimals));
}

export function parseBoundedInteger(
  value: string | undefined,
  options: Omit<NumberParseOptions, "decimals"> = {},
): number | undefined {
  const parsed = parseBoundedNumber(value, options);
  if (parsed === undefined) {
    return undefined;
  }
  return Math.round(parsed);
}

export function formatNumberForInput(value: number, decimals?: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }

  if (decimals === undefined) {
    return String(value);
  }

  return Number(value.toFixed(decimals)).toString();
}

export function parseDateOnly(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return DATE_ONLY_PATTERN.test(trimmed) ? trimmed : undefined;
}

export function parseDateOnlyToDate(
  value: string | undefined,
  fallback = new Date(),
): Date {
  const normalized = parseDateOnly(value);
  if (!normalized) {
    return fallback;
  }

  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed;
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().split("T")[0] ?? "";
}

export function parseHmsToSeconds(
  value: string | undefined,
): number | undefined {
  const trimmed = value?.trim() ?? "";
  const match = HMS_PATTERN.exec(trimmed);
  if (!match) {
    return undefined;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  return hours * 3600 + minutes * 60 + seconds;
}

export function parseMmSsToSeconds(
  value: string | undefined,
): number | undefined {
  const trimmed = value?.trim() ?? "";
  const match = MMSS_PATTERN.exec(trimmed);
  if (!match) {
    return undefined;
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  return minutes * 60 + seconds;
}

export function formatSecondsToHms(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (safe % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

export function formatSecondsToMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = (safe % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function normalizeDurationInput(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const exact = parseHmsToSeconds(trimmed);
  if (exact !== undefined) {
    return formatSecondsToHms(exact);
  }

  const mmss = parseMmSsToSeconds(trimmed);
  if (mmss !== undefined) {
    return formatSecondsToHms(mmss);
  }

  return undefined;
}

export function normalizePaceInput(value: string): string | undefined {
  const seconds = parseMmSsToSeconds(value);
  if (seconds === undefined) {
    return undefined;
  }
  return formatSecondsToMmSs(seconds);
}

export function parseDistanceKmToMeters(
  value: string | undefined,
): number | undefined {
  const parsed = parseBoundedNumber(value, { min: 0 });
  if (parsed === undefined || parsed <= 0) {
    return undefined;
  }
  return Math.round(parsed * 1000);
}
