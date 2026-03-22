import { z } from "zod";

// Re-export status enum
export const CoachingInvitationStatusSchema = z.enum(["pending", "accepted", "declined"]);
export type CoachingInvitationStatus = z.infer<typeof CoachingInvitationStatusSchema>;

// Extend base schema
export const CoachingInvitationSchema = z.object({
  athlete_id: z.string().uuid(),
  coach_id: z.string().uuid(),
  created_at: z.string(),
  id: z.string().uuid(),
  status: CoachingInvitationStatusSchema,
  updated_at: z.string(),
});
export type CoachingInvitation = z.infer<typeof CoachingInvitationSchema>;

// Input schemas (omit generated fields)
export const CreateCoachingInvitationSchema = CoachingInvitationSchema.pick({
  athlete_id: true,
  coach_id: true,
});
export type CreateCoachingInvitation = z.infer<typeof CreateCoachingInvitationSchema>;

export const RespondToInvitationSchema = z.object({
  invitation_id: z.string().uuid(),
  status: z.enum(["accepted", "declined"]), // Only allow responding with accepted/declined
});
export type RespondToInvitation = z.infer<typeof RespondToInvitationSchema>;

export const CoachAthleteRelationSchema = z.object({
  athlete_id: z.string().uuid(),
  coach_id: z.string().uuid(),
  created_at: z.string(),
});
export type CoachAthleteRelation = z.infer<typeof CoachAthleteRelationSchema>;
