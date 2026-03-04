import { Schemas } from "@repo/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const messagingRouter = createTRPCRouter({
  createConversation: protectedProcedure
    .input(Schemas.CreateConversationSchema)
    .mutation(async ({ ctx, input }) => {
      // Create conversation
      const { data: conversation, error: convError } = await ctx.supabase
        .from("conversations")
        .insert({
          is_group: input.participant_ids.length > 1,
          group_name: input.group_name,
        })
        .select()
        .single();

      if (convError)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: convError.message,
        });

      // Add participants (including self)
      const participants = [
        ...new Set([...input.participant_ids, ctx.session.user.id]),
      ];
      const { error: partError } = await ctx.supabase
        .from("conversation_participants")
        .insert(
          participants.map((uid) => ({
            conversation_id: conversation.id,
            user_id: uid,
          })),
        );

      if (partError)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: partError.message,
        });

      // Send initial message if provided
      if (input.initial_message) {
        await ctx.supabase.from("messages").insert({
          conversation_id: conversation.id,
          sender_id: ctx.session.user.id,
          content: input.initial_message,
        });
      }

      return conversation;
    }),

  getConversations: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("conversation_participants")
      .select(
        `
          conversation:conversations (
            *,
            messages (
              content,
              created_at,
              sender_id
            )
          )
        `,
      )
      .eq("user_id", ctx.session.user.id)
      .order("created_at", { foreignTable: "conversations", ascending: false });

    if (error)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    // @ts-ignore - Supabase types might be tricky with nested relations
    return data.map((d) => d.conversation);
  }),

  getMessages: protectedProcedure
    .input(z.object({ conversation_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", input.conversation_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      return data;
    }),

  sendMessage: protectedProcedure
    .input(Schemas.CreateMessageSchema)
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("messages").insert({
        conversation_id: input.conversation_id,
        sender_id: ctx.session.user.id,
        content: input.content,
      });

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });

      // Update last_message_at
      await ctx.supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", input.conversation_id);

      return { success: true };
    }),
});
