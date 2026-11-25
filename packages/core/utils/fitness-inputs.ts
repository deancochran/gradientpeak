import { z } from "zod";
import type { NumericInputResult } from "./numeric-ux-policy";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HMS_PATTERN = /^([0-9]+):([0-5][0-9]):([0-5][0-9])$/;
const MMSS_PATTERN = /^([0-9]+):([0-5][0-9])$/;
const POUNDS_PER_KILOGRAM = 2.20462;

export interface NumberParseOptions {
  min?: number;
  max?: number;
  decimals?: number;
}

export type WeightUnit = "kg" | "lbs";

export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampInteger(value: number, min: number, max: number): number {
  return Math.round(clampNumber(value, min, max));
}

export function parseNumberOrUndefined(value: string | undefined): number | undefined {
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

export function parseDateOnlyToDate(value: string | undefined): Date | undefined {
  const normalized = parseDateOnly(value);
  if (!normalized) {
    return undefined;
  }

  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}

/** The UTC calendar day of an instant. */
export function formatDateOnly(date: Date): string {
  return date.toISOString().split("T")[0] ?? "";
}

/** The device-local calendar day, paired with parseDateOnlyToDate and native date pickers. */
export function formatLocalDateOnly(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseHmsToSeconds(value: string | undefined): number | undefined {
  const trimmed = value?.trim() ?? "";
  const match = HMS_PATTERN.exec(trimmed);
  if (!match) {
    return undefined;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const total = hours * 3600 + minutes * 60 + seconds;
  return Number.isSafeInteger(total) ? total : undefined;
}

export function parseMmSsToSeconds(value: string | undefined): number | undefined {
  const trimmed = value?.trim() ?? "";
  const match = MMSS_PATTERN.exec(trimmed);
  if (!match) {
    return undefined;
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const total = minutes * 60 + seconds;
  return Number.isSafeInteger(total) ? total : undefined;
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

export const durationSegmentsSchema = z.object({
  hours: z.string(),
  minutes: z.string(),
  seconds: z.string(),
  /** Preserve an invalid incoming formatted string until the user edits it. */
  invalidText: z.string().optional(),
  invalidReason: z.enum(["syntax", "precision"]).optional(),
});
export type DurationSegments = z.infer<typeof durationSegmentsSchema>;
export type DurationSegmentLayout = "hms" | "hm" | "ms";
export const paceSegmentLayoutSchema = z.enum(["ms", "hms"]);
export type PaceSegmentLayout = z.infer<typeof paceSegmentLayoutSchema>;
export function resolvePaceSegmentLayout(layout: unknown = undefined): PaceSegmentLayout {
  const parsed = paceSegmentLayoutSchema.safeParse(layout === undefined ? "ms" : layout);
  if (!parsed.success) throw new RangeError('Pace layout must be "ms" or "hms".');
  return parsed.data;
}
export interface DurationSegmentPolicy {
  layout?: DurationSegmentLayout | undefined;
  minSeconds?: number | undefined;
  maxSeconds?: number | undefined;
  granularitySeconds?: number | undefined;
  allowOmittedSegments?: boolean | undefined;
}

export function durationSegmentKeys(
  layout: DurationSegmentLayout = "hms",
): ("hours" | "minutes" | "seconds")[] {
  return layout === "hm"
    ? ["hours", "minutes"]
    : layout === "ms"
      ? ["minutes", "seconds"]
      : ["hours", "minutes", "seconds"];
}

export function splitDurationSeconds(
  value: number | null | undefined,
  layout: DurationSegmentLayout = "hms",
): DurationSegments {
  if (value == null) return { hours: "", minutes: "", seconds: "" };
  // Preserve unsupported precision as text; never round it into another amount.
  if (!Number.isSafeInteger(value) || value < 0)
    return {
      hours: "0",
      minutes: "0",
      seconds: String(value),
      ...(layout === "hm"
        ? { invalidText: String(value), invalidReason: "precision" as const }
        : {}),
    };
  if (layout === "hm" && value % 60 !== 0)
    return {
      hours: String(Math.floor(value / 3600)),
      minutes: String(Math.floor((value % 3600) / 60)),
      seconds: String(value % 60),
      invalidText: formatSecondsToHms(value),
      invalidReason: "precision",
    };
  return {
    hours: layout === "ms" ? "0" : String(Math.floor(value / 3600)),
    minutes: String(layout === "ms" ? Math.floor(value / 60) : Math.floor((value % 3600) / 60)),
    seconds: layout === "hm" ? "0" : String(value % 60),
  };
}

export function parseDurationSegmentInput(
  parts: DurationSegments,
  policy: DurationSegmentPolicy = {},
): NumericInputResult {
  if (parts.invalidText !== undefined)
    return { status: "invalid", reason: parts.invalidReason ?? "syntax" };
  const layout = policy.layout ?? "hms";
  if (
    (layout === "hm" && parts.seconds !== "" && Number(parts.seconds) !== 0) ||
    (layout === "ms" && parts.hours !== "" && Number(parts.hours) !== 0)
  )
    return { status: "invalid", reason: "precision" };
  const keys = durationSegmentKeys(layout);
  if (keys.every((key) => !parts[key].trim())) return { status: "empty" };
  if (
    keys.some(
      (key) => !/^\d+$/.test(parts[key]) && !(policy.allowOmittedSegments && parts[key] === ""),
    )
  )
    return { status: "invalid", reason: "syntax" };
  const hours = layout === "ms" ? 0 : Number(parts.hours);
  const minutes = Number(parts.minutes);
  const seconds = layout === "hm" ? 0 : Number(parts.seconds);
  if ((layout !== "ms" && minutes >= 60) || seconds >= 60)
    return { status: "invalid", reason: "range" };
  const total = hours * 3600 + minutes * 60 + seconds;
  if (
    !Number.isSafeInteger(total) ||
    total % (policy.granularitySeconds ?? (layout === "hm" ? 60 : 1)) !== 0
  )
    return { status: "invalid", reason: "precision" };
  return total >= (policy.minSeconds ?? 1) &&
    total <= (policy.maxSeconds ?? Number.MAX_SAFE_INTEGER)
    ? { status: "valid", value: total }
    : { status: "invalid", reason: "range" };
}

export function parseDurationSegments(
  parts: DurationSegments,
  policy: DurationSegmentPolicy = {},
): number | null {
  const result = parseDurationSegmentInput(parts, policy);
  return result.status === "valid" ? result.value : null;
}

export function durationPrecisionMessage(
  parts: DurationSegments,
  policy: DurationSegmentPolicy = {},
): string | undefined {
  const result = parseDurationSegmentInput(parts, policy);
  if (policy.layout !== "hm" || result.status !== "invalid" || result.reason !== "precision")
    return undefined;
  return `Use whole-minute values. Original value: ${parts.invalidText ?? [parts.hours, parts.minutes, parts.seconds].join(":")}.`;
}

export function durationSegmentsText(
  parts: DurationSegments,
  policy: DurationSegmentPolicy = {},
): string {
  if (parts.invalidText !== undefined) return parts.invalidText;
  const result = parseDurationSegmentInput(parts, policy);
  if (result.status === "empty") return "";
  if (result.status === "valid") {
    if (policy.layout === "ms") return formatSecondsToMmSs(result.value);
    if (policy.layout === "hm")
      return `${Math.floor(result.value / 3600)}:${String((result.value / 60) % 60).padStart(2, "0")}`;
    return formatSecondsToHms(result.value);
  }
  return durationSegmentKeys(policy.layout)
    .map((key) => parts[key])
    .join(":");
}

export function durationTextSegments(
  raw: string,
  layout: DurationSegmentLayout = "hms",
): DurationSegments {
  if (!raw.trim()) return splitDurationSeconds(null, layout);
  const parsed =
    layout === "hms"
      ? (parseHmsToSeconds(raw) ?? parseMmSsToSeconds(raw))
      : layout === "ms"
        ? (parseMmSsToSeconds(raw) ?? parseHmsToSeconds(raw))
        : /^\d+:[0-5]\d$/.test(raw)
          ? Number(raw.split(":")[0]) * 3600 + Number(raw.split(":")[1]) * 60
          : parseHmsToSeconds(raw);
  if (parsed !== undefined && Number.isSafeInteger(parsed)) {
    const parts = splitDurationSeconds(parsed, layout);
    return parts.invalidText === undefined ? parts : { ...parts, invalidText: raw };
  }
  const keys = durationSegmentKeys(layout);
  const values = raw.split(":");
  const result = splitDurationSeconds(null, layout);
  if (values.length === keys.length)
    keys.forEach((key, index) => {
      result[key] = values[index] ?? "";
    });
  else result[layout === "hm" ? "minutes" : "seconds"] = raw;
  return { ...result, invalidText: raw };
}

export function durationMinutesToSeconds(
  value: number | null | undefined,
): number | null | undefined {
  return value == null ? value : value * 60;
}
export function paceTextSegments(raw: string, layout: PaceSegmentLayout = "ms"): DurationSegments {
  const parts = durationTextSegments(raw, resolvePaceSegmentLayout(layout));
  return raw.trim() && parseMmSsToSeconds(raw) === undefined
    ? { ...parts, invalidText: raw }
    : parts;
}

export function durationSecondsToWholeMinutes(value: number): number | undefined {
  return Number.isSafeInteger(value) && value % 60 === 0 ? value / 60 : undefined;
}

/** Preserve string APIs while a configured native display uses different units. */
export function durationSegmentsApiText(
  parts: DurationSegments,
  policy: DurationSegmentPolicy = {},
  output: "hms" | "ms" = "hms",
): string {
  const result = parseDurationSegmentInput(parts, {
    ...policy,
    minSeconds: 0,
    maxSeconds: Number.MAX_SAFE_INTEGER,
    allowOmittedSegments: true,
  });
  if (result.status === "empty") return "";
  if (result.status === "valid")
    return output === "ms" ? formatSecondsToMmSs(result.value) : formatSecondsToHms(result.value);
  return durationSegmentsText(parts, policy);
}

/** UI windows are bounded, not the domain. Always include the current primary value. */
export function durationWheelValues(
  part: "hours" | "minutes" | "seconds",
  parts: DurationSegments,
  policy: DurationSegmentPolicy = {},
): number[] {
  const primary = part === "hours" || (part === "minutes" && policy.layout === "ms");
  if (!primary) return Array.from({ length: 60 }, (_, value) => value);
  const unit = part === "hours" ? 3600 : 60;
  const configuredMax =
    policy.maxSeconds === undefined ? undefined : Math.floor(policy.maxSeconds / unit);
  const baseMax = Math.min(configuredMax ?? (part === "hours" ? 168 : 180), 180);
  const values = new Set(Array.from({ length: Math.max(0, baseMax) + 1 }, (_, value) => value));
  const current = Number(parts[part] || "0");
  if (Number.isSafeInteger(current) && current >= 0) {
    values.add(current);
    if (current > baseMax)
      for (
        let value = Math.max(0, current - 24);
        value <= current + 24 && value <= (configuredMax ?? Number.MAX_SAFE_INTEGER);
        value += 1
      )
        values.add(value);
  }
  return [...values].sort((a, b) => a - b);
}

export function durationSegmentsCanUseWheels(
  parts: DurationSegments,
  policy: DurationSegmentPolicy = {},
): boolean {
  if (parts.invalidText !== undefined) return false;
  return durationSegmentKeys(policy.layout).every((part) => {
    const raw = parts[part];
    if (raw === "") return true;
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) return false;
    return part === "hours" || (part === "minutes" && policy.layout === "ms") || Number(raw) < 60;
  });
}

export function formatDurationSeconds(value: number, policy: DurationSegmentPolicy = {}): string {
  const parts = splitDurationSeconds(value);
  if (parseDurationSegments(parts, policy) === null) return `${value} sec (needs correction)`;
  return [
    Number(parts.hours) ? `${parts.hours} hr` : "",
    Number(parts.minutes) ? `${parts.minutes} min` : "",
    Number(parts.seconds) ? `${parts.seconds} sec` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function parseDistanceKmToMeters(value: string | undefined): number | undefined {
  const distanceKm = parseBoundedNumber(value, { min: 0 });
  if (distanceKm === undefined || distanceKm <= 0) {
    return undefined;
  }

  return Math.round(distanceKm * 1000);
}

export function roundToDecimals(value: number, decimals = 1): number {
  return Number(value.toFixed(decimals));
}

export function convertWeightFromKg(valueKg: number, unit: WeightUnit): number {
  if (unit === "kg") {
    return valueKg;
  }

  return valueKg * POUNDS_PER_KILOGRAM;
}

export function convertWeightToKg(value: number, unit: WeightUnit): number {
  if (unit === "kg") {
    return value;
  }

  return value / POUNDS_PER_KILOGRAM;
}

export function formatWeightForDisplay(
  valueKg: number | null | undefined,
  unit: WeightUnit,
  decimals = 1,
): string {
  if (valueKg == null || !Number.isFinite(valueKg)) {
    return "";
  }

  return roundToDecimals(convertWeightFromKg(valueKg, unit), decimals).toString();
}

export function getWeightBounds(unit: WeightUnit): { min: number; max: number } {
  if (unit === "kg") {
    return { min: 30, max: 300 };
  }

  return {
    min: roundToDecimals(convertWeightFromKg(30, unit), 1),
    max: roundToDecimals(convertWeightFromKg(300, unit), 1),
  };
}
