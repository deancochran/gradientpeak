export const PROFILE_UPDATE_OVERRIDE_METHOD = "profile_update_override";
export const PROFILE_UPDATE_OVERRIDE_VERSION = "profile-update-v1";

export type ProfileOverrideObservation = {
  method?: string | null;
  provenance?: unknown;
};

export function profileOverrideProvenance(state: "active" | "cleared") {
  return { input: "profile_update", override_state: state };
}

export function isProfileOverrideObservation(input: ProfileOverrideObservation) {
  return input.method === PROFILE_UPDATE_OVERRIDE_METHOD;
}

export function isClearedProfileOverride(input: ProfileOverrideObservation) {
  if (!isProfileOverrideObservation(input)) return false;
  if (!input.provenance || typeof input.provenance !== "object") return false;
  return (input.provenance as { override_state?: unknown }).override_state === "cleared";
}

/** Rows must be newest-first. A tombstone resolves its key to null without reviving older rows. */
export function resolveLatestObservationsByKey<T extends ProfileOverrideObservation>(
  rows: readonly T[],
  keyOf: (row: T) => string,
): Map<string, T | null> {
  const latest = new Map<string, T | null>();
  for (const row of rows) {
    const key = keyOf(row);
    if (latest.has(key)) continue;
    latest.set(key, isClearedProfileOverride(row) ? null : row);
  }
  return latest;
}

/** Retains ordinary evidence and only the latest active row for each profile-override stream. */
export function filterSupersededProfileOverrides<T extends ProfileOverrideObservation>(
  rows: readonly T[],
  keyOf: (row: T) => string,
): T[] {
  const seenOverrides = new Set<string>();
  return rows.filter((row) => {
    if (!isProfileOverrideObservation(row)) return true;
    const key = keyOf(row);
    if (seenOverrides.has(key)) return false;
    seenOverrides.add(key);
    return !isClearedProfileOverride(row);
  });
}

/** Retains observations newer than a tombstone and hides that tombstone plus all older values. */
export function filterObservationsAfterLatestTombstone<T extends ProfileOverrideObservation>(
  rows: readonly T[],
  keyOf: (row: T) => string,
): T[] {
  const clearedKeys = new Set<string>();
  return rows.filter((row) => {
    const key = keyOf(row);
    if (clearedKeys.has(key)) return false;
    if (!isClearedProfileOverride(row)) return true;
    clearedKeys.add(key);
    return false;
  });
}
