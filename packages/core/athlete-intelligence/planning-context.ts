import { z } from "zod";

function isIanaTimezone(value: string): boolean {
  // Intl accepts fixed abbreviations on some runtimes; planning requires UTC or a
  // canonical/linked area identifier so DST behavior is deliberate.
  if (value !== "UTC" && !value.includes("/")) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const ianaTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(isIanaTimezone, "Timezone must be a valid IANA timezone");

/**
 * Request-only planning context. `asOf` deliberately permits only current-state
 * evaluation; historical or forecast semantics require a future explicit contract.
 * The empty typed evidence list is the extension point for future evidence variants.
 */
export const requestScopedAthletePlanningContextSchema = z
  .object({
    timezone: ianaTimezoneSchema,
    asOf: z.literal("current").optional(),
    supplementalEvidence: z.array(z.never()).max(0).default([]),
  })
  .strict();

export type RequestScopedAthletePlanningContextInput = z.input<
  typeof requestScopedAthletePlanningContextSchema
>;
export type RequestScopedAthletePlanningContext = z.output<
  typeof requestScopedAthletePlanningContextSchema
>;
