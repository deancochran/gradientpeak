import { z } from "zod";

export const CreateCoachingInvitationSchema = z.object({
  athlete_id: z.string().uuid(),
  coach_id: z.string().uuid(),
});
export type CreateCoachingInvitation = z.infer<typeof CreateCoachingInvitationSchema>;

export const RespondToInvitationSchema = z.object({
  invitation_id: z.string().uuid(),
  status: z.enum(["accepted", "declined"]), // Only allow responding with accepted/declined
});
export type RespondToInvitation = z.infer<typeof RespondToInvitationSchema>;
