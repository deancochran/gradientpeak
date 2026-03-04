import {
  publicCoachingInvitationsRowSchema,
  publicCoachesAthletesRowSchema,
  publicCoachingInvitationStatusSchema,
} from "@repo/supabase";
import { z } from "zod";

// Re-export status enum
export const CoachingInvitationStatusSchema =
  publicCoachingInvitationStatusSchema;
export type CoachingInvitationStatus = z.infer<
  typeof CoachingInvitationStatusSchema
>;

// Extend base schema
export const CoachingInvitationSchema = publicCoachingInvitationsRowSchema;
export type CoachingInvitation = z.infer<typeof CoachingInvitationSchema>;

// Input schemas (omit generated fields)
export const CreateCoachingInvitationSchema =
  publicCoachingInvitationsRowSchema.pick({
    athlete_id: true,
    coach_id: true,
  });
export type CreateCoachingInvitation = z.infer<
  typeof CreateCoachingInvitationSchema
>;

export const RespondToInvitationSchema = z.object({
  invitation_id: z.string().uuid(),
  status: z.enum(["accepted", "declined"]), // Only allow responding with accepted/declined
});
export type RespondToInvitation = z.infer<typeof RespondToInvitationSchema>;

export const CoachAthleteRelationSchema = publicCoachesAthletesRowSchema;
export type CoachAthleteRelation = z.infer<typeof CoachAthleteRelationSchema>;
