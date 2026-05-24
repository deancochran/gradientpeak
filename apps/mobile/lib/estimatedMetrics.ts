export function markEstimated(label: string | null | undefined) {
  if (!label) return null;
  return label.startsWith("~") ? label : `~${label}`;
}

function formatDurationSeconds(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function formatEstimatedDurationSeconds(seconds?: number | null) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  return markEstimated(formatDurationSeconds(Math.round(seconds)));
}

export function formatEstimatedDurationMinutes(minutes?: number | null) {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return null;
  return markEstimated(`${Math.round(minutes)} min`);
}

export function formatEstimatedTss(value?: number | null, options?: { includeUnit?: boolean }) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const rounded = Math.round(value).toString();
  return markEstimated(options?.includeUnit === false ? rounded : `${rounded} TSS`);
}

export function formatEstimatedIntensityFactor(
  value?: number | null,
  options?: { includeLabel?: boolean },
) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const formatted = value.toFixed(2);
  return markEstimated(options?.includeLabel ? `IF ${formatted}` : formatted);
}

export function formatEstimatedDistanceMeters(meters?: number | null) {
  if (typeof meters !== "number" || !Number.isFinite(meters) || meters <= 0) return null;
  const label = meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
  return markEstimated(label);
}
