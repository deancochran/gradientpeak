/** Exact UI segments. Empty/non-integer segments remain drafts, never a zero dose. */
export type DurationSegments = { hours: string; minutes: string; seconds: string };

export interface SegmentedDurationValueProps {
  valueSeconds: number;
  onChangeSeconds: (seconds: number) => void;
  /** Reports mounted validity and subsequent transitions, including restored controlled segments. */
  onInvalidChange: (invalid: boolean) => void;
  /** Optional controlled segments for owner-level snapshots and duplication of incomplete input. */
  segments?: DurationSegments;
  onSegmentsChange?: (segments: DurationSegments) => void;
  label?: string;
  id?: string;
  disabled?: boolean;
}

export function splitDurationSeconds(value: number): DurationSegments {
  if (!Number.isInteger(value) || value < 1 || value > 86400)
    return { hours: "0", minutes: "0", seconds: String(value) };
  return {
    hours: String(Math.floor(value / 3600)),
    minutes: String(Math.floor((value % 3600) / 60)),
    seconds: String(value % 60),
  };
}

export function parseDurationSegments(value: DurationSegments): number | null {
  if (!Object.values(value).every((part) => /^\d+$/.test(part))) return null;
  const hours = Number(value.hours);
  const minutes = Number(value.minutes);
  const seconds = Number(value.seconds);
  const total = hours * 3600 + minutes * 60 + seconds;
  return minutes < 60 && seconds < 60 && Number.isSafeInteger(total) && total >= 1 && total <= 86400
    ? total
    : null;
}

export function formatDurationSeconds(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 86400)
    return `${value} sec (needs correction)`;
  const parts = splitDurationSeconds(value);
  return [
    Number(parts.hours) ? `${parts.hours} hr` : "",
    Number(parts.minutes) ? `${parts.minutes} min` : "",
    Number(parts.seconds) ? `${parts.seconds} sec` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
