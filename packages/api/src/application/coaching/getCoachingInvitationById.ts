import { coachingInvitations } from "@repo/db";
import { eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";

type CoachingDb = ReturnType<typeof getRequiredDb>;

export type CoachingInvitation = {
  athlete_id: string;
  coach_id: string;
  created_at: string;
  id: string;
  status: "pending" | "accepted" | "declined";
  updated_at: string;
};

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

export async function getCoachingInvitationById(
  db: CoachingDb,
  invitationId: string,
): Promise<CoachingInvitation | null> {
  const row =
    (
      await db
        .select({
          id: coachingInvitations.id,
          athlete_id: coachingInvitations.athlete_id,
          coach_id: coachingInvitations.coach_id,
          status: coachingInvitations.status,
          created_at: coachingInvitations.created_at,
          updated_at: coachingInvitations.updated_at,
        })
        .from(coachingInvitations)
        .where(eq(coachingInvitations.id, invitationId))
        .limit(1)
    )[0] ?? null;

  return row
    ? {
        ...row,
        created_at: toIsoString(row.created_at),
        updated_at: toIsoString(row.updated_at),
      }
    : null;
}
