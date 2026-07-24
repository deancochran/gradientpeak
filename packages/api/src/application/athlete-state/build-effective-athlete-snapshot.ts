import { type AthleteContextSourceSnapshot, createEffectiveAthleteSnapshot } from "@repo/core";

/** Server-owned boundary for converting raw evidence reads into one effective as-of projection. */
export function buildEffectiveAthleteSnapshot(
  input: AthleteContextSourceSnapshot & { asOf: string | Date },
) {
  return createEffectiveAthleteSnapshot(input);
}
