import {
  CreateConversationSchema,
  CreateMessageSchema,
  normalizeConversationSummaryList,
  normalizeMessageList,
} from "@repo/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const messagingRouter = createTRPCRouter({
  getOrCreateDM: protectedProcedure
    .input(z.object({ target_user_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = ctx.supabase as any;

      // Find existing 1-on-1 conversations for current user
      const { data: userConversations, error: convError } = await supabase
        .from("conversation_participants")
        .select(
          `
          conversation_id,
          conversation:conversations!inner(is_group)
        `,
        )
        .eq("user_id", ctx.session.user.id)
        .eq("conversation.is_group", false);

      if (convError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: convError.message,
        });
      }

      const convIds = (userConversations as Array<{ conversation_id: string }>).map(
        (conversation) => conversation.conversation_id,
      );

      if (convIds.length > 0) {
        // Find if target user is in any of these
        const { data: targetConversations, error: targetError } = await supabase
          .from("conversation_participants")
          .select("conversation_id")
          .eq("user_id", input.target_user_id)
          .in("conversation_id", convIds);

        if (targetError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: targetError.message,
          });
        }

        if (targetConversations && targetConversations.length > 0) {
          // Return the first match
          const conversation_id = targetConversations[0]?.conversation_id;
          if (conversation_id) {
            const { data: conversation } = await supabase
              .from("conversations")
              .select("*")
              .eq("id", conversation_id)
              .single();

            return conversation;
          }
        }
      }

      // If not found, create new DM
      const { data: newConversation, error: createError } = await supabase
        .from("conversations")
        .insert({ is_group: false })
        .select()
        .single();

      if (createError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: createError.message,
        });
      }

      const participants = [
        { conversation_id: newConversation.id, user_id: ctx.session.user.id },
        { conversation_id: newConversation.id, user_id: input.target_user_id },
      ];

      const { error: partError } = await supabase
        .from("conversation_participants")
        .insert(participants);

      if (partError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: partError.message,
        });
      }

      return newConversation;
    }),

  createConversation: protectedProcedure
    .input(CreateConversationSchema)
    .mutation(async ({ ctx, input }) => {
      const supabase = ctx.supabase as any;

      // Create conversation
      const { data: conversation, error: convError } = await supabase
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
      const participants = [...new Set([...input.participant_ids, ctx.session.user.id])];
      const { error: partError } = await supabase.from("conversation_participants").insert(
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
        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          sender_id: ctx.session.user.id,
          content: input.initial_message,
        });
      }

      return conversation;
    }),

  getConversations: protectedProcedure.query(async ({ ctx }) => {
    const supabase = ctx.supabase as any;

    // First get all conversations for the user
    const { data: conversations, error } = await supabase
      .from("conversation_participants")
      .select(
        `
          conversation:conversations (
            id,
            is_group,
            group_name,
            created_at,
            last_message_at
          )
        `,
      )
      .eq("user_id", ctx.session.user.id);

    if (error)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });

    if (!conversations || conversations.length === 0) {
      return [];
    }

    // Sort conversations by last_message_at in memory
    const sortedConversations = [...conversations].sort((a: any, b: any) => {
      const aTime = new Date(a.conversation.last_message_at || 0).getTime();
      const bTime = new Date(b.conversation.last_message_at || 0).getTime();
      return bTime - aTime;
    });

    // Get conversation IDs
    const conversationIds = sortedConversations.map((c: any) => c.conversation.id);

    const { data: participants } = await supabase
      .from("conversation_participants")
      .select("conversation_id, user_id")
      .in("conversation_id", conversationIds)
      .neq("user_id", ctx.session.user.id);

    const typedParticipants = (participants || []) as Array<{
      conversation_id: string;
      user_id: string;
    }>;

    const peerIds = Array.from(
      new Set(typedParticipants.map((participant) => participant.user_id)),
    );

    const { data: peerProfiles } = peerIds.length
      ? await supabase.from("profiles").select("id, username, avatar_url").in("id", peerIds)
      : { data: [] as Array<Record<string, unknown>> };

    const typedPeerProfiles = (peerProfiles || []) as Array<
      Record<string, unknown> & { id: string }
    >;

    const peerProfileById = new Map<string, Record<string, unknown>>(
      typedPeerProfiles.map((profile) => [profile.id, profile]),
    );
    const peerProfileByConversationId = new Map<string, Record<string, unknown> | null>();

    for (const participant of typedParticipants) {
      if (!peerProfileByConversationId.has(participant.conversation_id)) {
        peerProfileByConversationId.set(
          participant.conversation_id,
          peerProfileById.get(participant.user_id) ?? null,
        );
      }
    }

    // Get unread counts for all conversations
    const { data: unreadCounts } = await supabase
      .from("messages")
      .select("conversation_id, id")
      .in("conversation_id", conversationIds)
      .neq("sender_id", ctx.session.user.id)
      .is("deleted_at", null);

    // Group unread counts by conversation
    const unreadMap = new Map<string, number>();
    unreadCounts?.forEach((msg: any) => {
      const count = unreadMap.get(msg.conversation_id) || 0;
      unreadMap.set(msg.conversation_id, count + 1);
    });

    // Get last message for each conversation
    const { data: lastMessages } = await supabase
      .from("messages")
      .select("conversation_id, content, created_at, deleted_at, id, sender_id")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false });

    // Group last messages by conversation
    const lastMessageMap = new Map<string, any>();
    lastMessages?.forEach((msg: any) => {
      if (!lastMessageMap.has(msg.conversation_id)) {
        lastMessageMap.set(msg.conversation_id, msg);
      }
    });

    // Combine data
    const result = sortedConversations.map((c: any) => ({
      ...c.conversation,
      last_message: lastMessageMap.get(c.conversation.id) ?? null,
      messages: lastMessageMap.get(c.conversation.id)
        ? [lastMessageMap.get(c.conversation.id)]
        : [],
      peer_profile: peerProfileByConversationId.get(c.conversation.id) ?? null,
      unread_count: unreadMap.get(c.conversation.id) || 0,
    }));

    return normalizeConversationSummaryList(result);
  }),

  getMessages: protectedProcedure
    .input(z.object({ conversation_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const supabase = ctx.supabase as any;

      const { data, error } = await supabase
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
      return normalizeMessageList(data ?? []);
    }),

  sendMessage: protectedProcedure.input(CreateMessageSchema).mutation(async ({ ctx, input }) => {
    const supabase = ctx.supabase as any;

    const { error } = await supabase.from("messages").insert({
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
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", input.conversation_id);

    return { success: true };
  }),

  markAsRead: protectedProcedure
    .input(z.object({ conversation_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // messages no longer store per-row read_at in current schema.
      // Keep endpoint as a compatibility no-op until read receipts are modeled.
      void input;
      void ctx;
      return { success: true };
    }),

  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const supabase = ctx.supabase as any;

    // Get all conversations the user is part of
    const { data: conversations } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", ctx.session.user.id);

    if (!conversations || conversations.length === 0) {
      return 0;
    }

    const conversationIds = (conversations as Array<{ conversation_id: string }>).map(
      (conversation) => conversation.conversation_id,
    );

    // messages no longer store read receipt state; return conversation count
    // excluding sender-specific filtering as a compatibility approximation.
    const { count, error } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .in("conversation_id", conversationIds)
      .neq("sender_id", ctx.session.user.id);

    if (error)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });

    return count || 0;
  }),
});
