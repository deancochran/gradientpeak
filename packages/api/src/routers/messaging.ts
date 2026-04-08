import {
  CreateConversationSchema,
  CreateMessageSchema,
  normalizeConversationSummaryList,
  normalizeMessageList,
} from "@repo/core";
import {
  conversationParticipants,
  conversations,
  messages,
  publicConversationsRowSchema,
  publicMessagesRowSchema,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, asc, count, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const timestampSchema = z.union([z.date(), z.string()]);

const getOrCreateDMInputSchema = z.object({ target_user_id: z.string().uuid() }).strict();

const createConversationInputSchema = CreateConversationSchema.strict();

const getMessagesInputSchema = z.object({ conversation_id: z.string().uuid() }).strict();

const createMessageInputSchema = CreateMessageSchema.strict();

const markAsReadInputSchema = z.object({ conversation_id: z.string().uuid() }).strict();

const conversationRowSchema = z.object({
  id: publicConversationsRowSchema.shape.id,
  is_group: publicConversationsRowSchema.shape.is_group,
  group_name: publicConversationsRowSchema.shape.group_name,
  created_at: timestampSchema,
  last_message_at: timestampSchema.nullable(),
});

const messageRowSchema = z.object({
  id: publicMessagesRowSchema.shape.id,
  conversation_id: publicMessagesRowSchema.shape.conversation_id,
  sender_id: publicMessagesRowSchema.shape.sender_id,
  content: publicMessagesRowSchema.shape.content,
  created_at: timestampSchema,
  deleted_at: timestampSchema.nullable().optional(),
  read_at: timestampSchema.nullable().optional(),
});

const conversationSummaryRowSchema = z.object({
  id: z.string().uuid(),
  is_group: z.boolean(),
  group_name: z.string().nullable(),
  created_at: z.union([z.date(), z.string()]),
  last_message_at: z.union([z.date(), z.string()]).nullable(),
  unread_count: z.union([z.number(), z.string()]),
  last_message_id: z.string().uuid().nullable(),
  last_message_conversation_id: z.string().uuid().nullable(),
  last_message_sender_id: z.string().uuid().nullable(),
  last_message_content: z.string().nullable(),
  last_message_created_at: z.union([z.date(), z.string()]).nullable(),
  last_message_deleted_at: z.union([z.date(), z.string()]).nullable(),
  peer_profile_id: z.string().uuid().nullable(),
  peer_profile_username: z.string().nullable(),
  peer_profile_full_name: z.string().nullable(),
  peer_profile_avatar_url: z.string().nullable(),
});

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function toConversation(value: z.infer<typeof conversationRowSchema>) {
  return {
    id: value.id,
    is_group: value.is_group,
    group_name: value.group_name,
    created_at: toIsoString(value.created_at),
    last_message_at: toIsoString(value.last_message_at),
  };
}

function toMessage(value: z.infer<typeof messageRowSchema>) {
  return {
    id: value.id,
    conversation_id: value.conversation_id,
    sender_id: value.sender_id,
    content: value.content,
    created_at: toIsoString(value.created_at),
    deleted_at: toIsoString(value.deleted_at),
    read_at: toIsoString(value.read_at),
  };
}

async function requireConversationParticipant(
  db: ReturnType<typeof getRequiredDb>,
  input: {
    conversationId: string;
    userId: string;
  },
) {
  const membership = await db
    .select({ user_id: conversationParticipants.user_id })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversation_id, input.conversationId),
        eq(conversationParticipants.user_id, input.userId),
      ),
    )
    .limit(1);

  if (!membership[0]) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Conversation not found",
    });
  }
}

export const messagingRouter = createTRPCRouter({
  getOrCreateDM: protectedProcedure
    .input(getOrCreateDMInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      try {
        const existingConversationResult = await db.execute(sql`
          select c.id, c.is_group, c.group_name, c.created_at, c.last_message_at
          from conversations c
          where c.is_group = false
            and exists(
              select 1
              from conversation_participants cp
              where cp.conversation_id = c.id
                and cp.user_id = ${ctx.session.user.id}::uuid
            )
            and exists(
              select 1
              from conversation_participants cp
              where cp.conversation_id = c.id
                and cp.user_id = ${input.target_user_id}::uuid
            )
            and (
              select count(*)
              from conversation_participants cp
              where cp.conversation_id = c.id
            ) = 2
          limit 1
        `);

        const existingConversationRow = existingConversationResult.rows[0]
          ? conversationRowSchema.parse(existingConversationResult.rows[0])
          : null;

        if (existingConversationRow) {
          return toConversation(existingConversationRow);
        }

        const newConversationRow = await db.transaction(async (tx) => {
          const [conversation] = await tx
            .insert(conversations)
            .values({ is_group: false })
            .returning({
              id: conversations.id,
              is_group: conversations.is_group,
              group_name: conversations.group_name,
              created_at: conversations.created_at,
              last_message_at: conversations.last_message_at,
            });

          const parsedConversation = conversationRowSchema.parse(conversation);

          await tx.insert(conversationParticipants).values([
            {
              conversation_id: parsedConversation.id,
              user_id: ctx.session.user.id,
            },
            {
              conversation_id: parsedConversation.id,
              user_id: input.target_user_id,
            },
          ]);

          return parsedConversation;
        });

        return toConversation(newConversationRow);
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Failed to load or create direct message conversation. The existing DM lookup remains on narrow SQL because expressing the exact two-participant constraint is still awkward in Drizzle.",
          cause: error,
        });
      }
    }),

  createConversation: protectedProcedure
    .input(createConversationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      try {
        const participantIds = [...new Set([...input.participant_ids, ctx.session.user.id])];

        return await db.transaction(async (tx) => {
          const [createdConversation] = await tx
            .insert(conversations)
            .values({
              is_group: participantIds.length > 2,
              group_name: input.group_name ?? null,
            })
            .returning({
              id: conversations.id,
              is_group: conversations.is_group,
              group_name: conversations.group_name,
              created_at: conversations.created_at,
              last_message_at: conversations.last_message_at,
            });

          const conversation = conversationRowSchema.parse(createdConversation);

          await tx.insert(conversationParticipants).values(
            participantIds.map((participantId) => ({
              conversation_id: conversation.id,
              user_id: participantId,
            })),
          );

          if (!input.initial_message) {
            return toConversation(conversation);
          }

          await tx.insert(messages).values({
            conversation_id: conversation.id,
            sender_id: ctx.session.user.id,
            content: input.initial_message,
          });

          const [updatedConversation] = await tx
            .update(conversations)
            .set({ last_message_at: new Date() })
            .where(eq(conversations.id, conversation.id))
            .returning({
              id: conversations.id,
              is_group: conversations.is_group,
              group_name: conversations.group_name,
              created_at: conversations.created_at,
              last_message_at: conversations.last_message_at,
            });

          return toConversation(conversationRowSchema.parse(updatedConversation));
        });
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create conversation.",
          cause: error,
        });
      }
    }),

  getConversations: protectedProcedure.query(async ({ ctx }) => {
    const db = getRequiredDb(ctx);

    try {
      const result = await db.execute(sql`
        select
          c.id,
          c.is_group,
          c.group_name,
          c.created_at,
          c.last_message_at,
          coalesce(unread_counts.unread_count, 0) as unread_count,
          lm.id as last_message_id,
          lm.conversation_id as last_message_conversation_id,
          lm.sender_id as last_message_sender_id,
          lm.content as last_message_content,
          lm.created_at as last_message_created_at,
          lm.deleted_at as last_message_deleted_at,
          peer.id as peer_profile_id,
          peer.username as peer_profile_username,
          peer.full_name as peer_profile_full_name,
          peer.avatar_url as peer_profile_avatar_url
        from conversation_participants membership
        inner join conversations c on c.id = membership.conversation_id
        left join lateral (
          select count(*) as unread_count
          from messages m
          where m.conversation_id = c.id
            and m.sender_id <> ${ctx.session.user.id}::uuid
            and m.deleted_at is null
        ) unread_counts on true
        left join lateral (
          select m.id, m.conversation_id, m.sender_id, m.content, m.created_at, m.deleted_at
          from messages m
          where m.conversation_id = c.id
          order by m.created_at desc
          limit 1
        ) lm on true
        left join lateral (
          select p.id, p.username, p.full_name, p.avatar_url
          from conversation_participants cp
          inner join profiles p on p.id = cp.user_id
          where cp.conversation_id = c.id
            and cp.user_id <> ${ctx.session.user.id}::uuid
          order by cp.user_id asc
          limit 1
        ) peer on true
        where membership.user_id = ${ctx.session.user.id}::uuid
        order by c.last_message_at desc nulls last, c.created_at desc
      `);

      const rows = result.rows.map((row) => conversationSummaryRowSchema.parse(row));

      return normalizeConversationSummaryList(
        rows.map((row) => ({
          id: row.id,
          is_group: row.is_group,
          group_name: row.group_name,
          created_at: toIsoString(row.created_at),
          last_message_at: toIsoString(row.last_message_at),
          unread_count: Number(row.unread_count ?? 0),
          last_message: row.last_message_id
            ? {
                id: row.last_message_id,
                conversation_id: row.last_message_conversation_id,
                sender_id: row.last_message_sender_id,
                content: row.last_message_content,
                created_at: toIsoString(row.last_message_created_at),
                deleted_at: toIsoString(row.last_message_deleted_at),
              }
            : null,
          peer_profile: row.peer_profile_id
            ? {
                id: row.peer_profile_id,
                username: row.peer_profile_username,
                full_name: row.peer_profile_full_name,
                avatar_url: row.peer_profile_avatar_url,
              }
            : null,
        })),
      );
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Failed to load conversations. The summary query still uses narrow SQL because the lateral unread, last-message, and peer-profile projection is materially clearer there.",
        cause: error,
      });
    }
  }),

  getMessages: protectedProcedure
    .input(getMessagesInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      try {
        await requireConversationParticipant(db, {
          conversationId: input.conversation_id,
          userId: ctx.session.user.id,
        });

        const rows = await db
          .select({
            id: messages.id,
            conversation_id: messages.conversation_id,
            sender_id: messages.sender_id,
            content: messages.content,
            created_at: messages.created_at,
            deleted_at: messages.deleted_at,
            read_at: messages.read_at,
          })
          .from(messages)
          .where(
            and(eq(messages.conversation_id, input.conversation_id), isNull(messages.deleted_at)),
          )
          .orderBy(asc(messages.created_at));

        return normalizeMessageList(rows.map((row) => toMessage(messageRowSchema.parse(row))));
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to load messages.",
          cause: error,
        });
      }
    }),

  sendMessage: protectedProcedure.input(createMessageInputSchema).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);

    try {
      await requireConversationParticipant(db, {
        conversationId: input.conversation_id,
        userId: ctx.session.user.id,
      });

      await db.transaction(async (tx) => {
        await tx.insert(messages).values({
          conversation_id: input.conversation_id,
          sender_id: ctx.session.user.id,
          content: input.content,
        });

        await tx
          .update(conversations)
          .set({ last_message_at: new Date() })
          .where(eq(conversations.id, input.conversation_id));
      });

      return { success: true };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to send message.",
        cause: error,
      });
    }
  }),

  markAsRead: protectedProcedure
    .input(markAsReadInputSchema)
    .mutation(async ({ ctx, input }) => {
      void input;
      void ctx;
      return { success: true };
    }),

  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const db = getRequiredDb(ctx);

    try {
      const [result] = await db
        .select({ unread_count: count() })
        .from(messages)
        .innerJoin(
          conversationParticipants,
          and(
            eq(conversationParticipants.conversation_id, messages.conversation_id),
            eq(conversationParticipants.user_id, ctx.session.user.id),
          ),
        )
        .where(and(ne(messages.sender_id, ctx.session.user.id), isNull(messages.deleted_at)));

      return Number(result?.unread_count ?? 0);
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to load unread count.",
        cause: error,
      });
    }
  }),
});
