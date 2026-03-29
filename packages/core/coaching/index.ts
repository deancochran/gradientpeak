import { z } from "zod";

import { normalizeProfileSummary, profileSummarySchema } from "../profile";

export const coachRosterEntrySchema = z.object({
  athlete_id: z.string().uuid(),
  profile: profileSummarySchema.nullable(),
});

export type CoachRosterEntry = z.infer<typeof coachRosterEntrySchema>;

export function normalizeCoachRosterEntry(value: unknown): CoachRosterEntry | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as {
    athlete_id?: unknown;
    profile?: unknown;
    profiles?: unknown;
  };

  const parsed = coachRosterEntrySchema.safeParse({
    athlete_id: candidate.athlete_id,
    profile: normalizeProfileSummary(candidate.profile ?? candidate.profiles),
  });

  return parsed.success ? parsed.data : null;
}

export function normalizeCoachRoster(values: readonly unknown[]): CoachRosterEntry[] {
  return values
    .map((value) => normalizeCoachRosterEntry(value))
    .filter((value): value is CoachRosterEntry => value !== null);
}
