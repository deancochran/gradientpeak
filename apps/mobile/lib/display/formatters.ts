import {
  formatDisplayUnitValue,
  type PreferredUnitSystem,
  toDisplayUnitValue,
} from "@repo/core/units";
import {
  differenceInHours,
  format,
  formatDistanceToNow,
  isToday,
  isValid,
  isYesterday,
} from "date-fns";

export type DateLike = Date | string | null | undefined;

/** Explicit display preference for formatters that adapt canonical SI values. */
export type PreferredUnitDisplayOptions = {
  fallback?: string;
  preferredUnitSystem: PreferredUnitSystem;
};

function toValidDate(value: DateLike): Date | null {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  return isValid(date) ? date : null;
}

export function formatRelativeTime(value: Date | string): string {
  const date = toValidDate(value);

  if (!date) return "";

  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return "Yesterday";

  return format(date, "M/d/yy");
}

export function formatDateStamp(value: DateLike, fallback = ""): string {
  const date = toValidDate(value);
  return date ? format(date, "MMM d, yyyy") : fallback;
}

export function formatSmartTimestamp(value: DateLike): string | null {
  const date = toValidDate(value);
  if (!date) return null;

  const hoursAgo = differenceInHours(new Date(), date);

  if (hoursAgo >= 0 && hoursAgo < 24) {
    return formatDistanceToNow(date, { addSuffix: true });
  }

  if (hoursAgo >= 24 && hoursAgo < 48) {
    return `Yesterday at ${format(date, "h:mm a")}`;
  }

  return format(date, "MMM d, yyyy • h:mm a");
}

export function formatTimestamp(value: DateLike, prefix = "Updated"): string | null {
  const label = formatDateStamp(value);
  return label ? `${prefix} ${label}` : null;
}

export function formatDistanceMeters(
  meters: number | null | undefined,
  options: {
    fallback?: string;
    minimumKilometers?: number;
    maximumFractionDigits?: number;
    preferredUnitSystem?: PreferredUnitSystem;
  } = {},
): string {
  const {
    fallback = "--",
    maximumFractionDigits = 2,
    minimumKilometers = 1000,
    preferredUnitSystem,
  } = options;

  if (typeof meters !== "number" || !Number.isFinite(meters)) return fallback;

  if (preferredUnitSystem) {
    return formatDisplayUnitValue(
      toDisplayUnitValue(
        { dimension: "distance", value: meters, unit: "meters" },
        preferredUnitSystem,
      ),
    );
  }

  if (Math.abs(meters) < minimumKilometers) {
    return `${Math.round(meters)} m`;
  }

  return `${(meters / 1000).toFixed(maximumFractionDigits)} km`;
}

export function formatElevationMeters(
  meters: number | null | undefined,
  fallbackOrOptions: string | PreferredUnitDisplayOptions = "--",
): string {
  const options: { fallback?: string; preferredUnitSystem?: PreferredUnitSystem } =
    typeof fallbackOrOptions === "string" ? { fallback: fallbackOrOptions } : fallbackOrOptions;
  const { fallback = "--", preferredUnitSystem } = options;

  if (typeof meters !== "number" || !Number.isFinite(meters) || meters <= 0) return fallback;

  if (preferredUnitSystem) {
    return formatDisplayUnitValue(
      toDisplayUnitValue(
        { dimension: "elevation", value: meters, unit: "meters" },
        preferredUnitSystem,
      ),
    );
  }

  return `${Math.round(meters)} m`;
}

/** Formats a canonical meters-per-second speed in an explicitly selected display system. */
export function formatSpeedMetersPerSecond(
  metersPerSecond: number | null | undefined,
  { fallback = "--", preferredUnitSystem }: PreferredUnitDisplayOptions,
): string {
  if (typeof metersPerSecond !== "number" || !Number.isFinite(metersPerSecond)) return fallback;

  return formatDisplayUnitValue(
    toDisplayUnitValue(
      { dimension: "speed", value: metersPerSecond, unit: "meters_per_second" },
      preferredUnitSystem,
    ),
  );
}

export function formatDurationSeconds(
  seconds: number | null | undefined,
  options: { fallback?: string; compact?: boolean } = {},
): string {
  const { fallback = "--", compact = false } = options;

  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return fallback;

  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (compact) {
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${remainingSeconds}s`;
  }

  if (hours > 0) return `${hours} hr ${minutes} min`;
  if (minutes > 0) return `${minutes} min`;
  return `${remainingSeconds} sec`;
}

export function formatPaceSecondsPerKilometer(
  secondsPerKilometer: number | null | undefined,
  fallbackOrOptions: string | PreferredUnitDisplayOptions = "--",
): string {
  const options: { fallback?: string; preferredUnitSystem?: PreferredUnitSystem } =
    typeof fallbackOrOptions === "string" ? { fallback: fallbackOrOptions } : fallbackOrOptions;
  const { fallback = "--", preferredUnitSystem } = options;

  if (
    typeof secondsPerKilometer !== "number" ||
    !Number.isFinite(secondsPerKilometer) ||
    secondsPerKilometer <= 0
  ) {
    return fallback;
  }

  if (preferredUnitSystem) {
    return formatDisplayUnitValue(
      toDisplayUnitValue(
        { dimension: "running_pace", value: secondsPerKilometer, unit: "seconds_per_kilometer" },
        preferredUnitSystem,
      ),
    );
  }

  const minutes = Math.floor(secondsPerKilometer / 60);
  const seconds = Math.round(secondsPerKilometer % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
