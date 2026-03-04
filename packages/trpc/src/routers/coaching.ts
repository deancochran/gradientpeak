import { Schemas } from "@repo/core";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const coachingRouter = createTRPCRouter({
  invite: protectedProcedure
    .input(Schemas.CreateCoachingInvitationSchema)
    .mutation(async ({ ctx, input }) => {
      // Ensure user is either the coach or the athlete
      if (
        ctx.session.user.id !== input.coach_id &&
        ctx.session.user.id !== input.athlete_id
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only invite for yourself",
        });
      }

      const { error } = await ctx.supabase.from("coaching_invitations").insert({
        athlete_id: input.athlete_id,
        coach_id: input.coach_id,
        status: "pending",
      });

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      return { success: true };
    }),

  respond: protectedProcedure
    .input(Schemas.RespondToInvitationSchema)
    .mutation(async ({ ctx, input }) => {
      // Fetch invitation to verify ownership
      const { data: invitation, error: fetchError } = await ctx.supabase
        .from("coaching_invitations")
        .select("*")
        .eq("id", input.invitation_id)
        .single();

      if (fetchError || !invitation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found",
        });
      }

      if (
        ctx.session.user.id !== invitation.athlete_id &&
        ctx.session.user.id !== invitation.coach_id
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { error } = await ctx.supabase
        .from("coaching_invitations")
        .update({ status: input.status })
        .eq("id", input.invitation_id);

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });

      // If accepted, create the relationship
      if (input.status === "accepted") {
        const { error: relError } = await ctx.supabase
          .from("coaches_athletes")
          .insert({
            coach_id: invitation.coach_id,
            athlete_id: invitation.athlete_id,
          });
        if (relError)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: relError.message,
          });
      }

      return { success: true };
    }),

  getRoster: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("coaches_athletes")
      .select("athlete_id, profiles!athlete_id(*)")
      .eq("coach_id", ctx.session.user.id);

    if (error)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    return data;
  }),

  getCoach: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("coaches_athletes")
      .select("coach_id, profiles!coach_id(*)")
      .eq("athlete_id", ctx.session.user.id)
      .single();

    if (error && error.code !== "PGRST116")
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    return data;
  }),
});
