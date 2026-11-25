import {
  CreateConversationSchema,
  CreateMessageSchema,
  normalizeConversationSummaryList,
} from "@repo/core";
import {
  conversationParticipants,
  conversations,
  messages,
  profiles,
  publicConversationsRowSchema,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, count, eq, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import {
  getConversationMessagesForViewer,
  isConversationParticipant,
} from "../application/messaging/getConversationMessages";
import {
  executeWithOperationReceipt,
  OperationReceiptConflictError,
  OperationReceiptCorruptError,
  OperationReceiptUnauthorizedError,
} from "../application/operation-receipts";
import { resolveProfileMediaUrl } from "../application/storage/profile-media-url";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const timestampSchema = z.union([z.date(), z.string()]);

const getOrCreateDMInputSchema = z.object({ target_user_id: z.string().uuid() }).strict();

const createConversationInputSchema = CreateConversationSchema.strict().superRefine(
  (input, ctx) => {
    if (new Set(input.participant_ids).size < 2) {
      ctx.addIssue({
        code: "custom",
        message: "A group conversation requires at least two other participants.",
        path: ["participant_ids"],
      });
    }
  },
);

const getMessagesInputSchema = z.object({ conversation_id: z.string().uuid() }).strict();

export const createMessageInputSchema = CreateMessageSchema.extend({
  operation_id: z
    .string()
    .regex(/^[A-Za-z0-9_-]{32,128}$/)
    .optional(),
}).strict();
const sendMessageOutputSchema = z.object({ success: z.literal(true) }).strict();

const markAsReadInputSchema = z.object({ conversation_id: z.string().uuid() }).strict();

const conversationRowSchema = z.object({
  id: publicConversationsRowSchema.shape.id,
  is_group: publicConversationsRowSchema.shape.is_group,
  group_name: publicConversationsRowSchema.shape.group_name,
  created_at: timestampSchema,
  last_message_at: timestampSchema.nullable(),
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

const markedConversationSchema = z.object({
  conversation_id: z.string().uuid(),
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

export const messagingRouter = createTRPCRouter({
  getOrCreateDM: protectedProcedure
    .input(getOrCreateDMInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      try {
        if (input.target_user_id === ctx.session.user.id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A direct-message recipient must be another profile.",
          });
        }

        const viewerMembership = alias(conversationParticipants, "viewer_membership");
        const targetMembership = alias(conversationParticipants, "target_membership");
        const participantCount = alias(conversationParticipants, "participant_count");
        const [existingConversation] = await db
          .select({
            id: conversations.id,
            is_group: conversations.is_group,
            group_name: conversations.group_name,
            created_at: conversations.created_at,
            last_message_at: conversations.last_message_at,
          })
          .from(conversations)
          .innerJoin(viewerMembership, eq(viewerMembership.conversation_id, conversations.id))
          .innerJoin(targetMembership, eq(targetMembership.conversation_id, conversations.id))
          .where(
            and(
              eq(conversations.is_group, false),
              eq(viewerMembership.user_id, ctx.session.user.id),
              eq(targetMembership.user_id, input.target_user_id),
              sql`(select count(*) from ${conversationParticipants} as ${sql.identifier("participant_count")} where ${participantCount.conversation_id} = ${conversations.id}) = 2`,
            ),
          )
          .limit(1);

        const existingConversationRow = existingConversation
          ? conversationRowSchema.parse(existingConversation)
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
          message: "Failed to load or create direct message conversation.",
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
        if (participantIds.length < 3) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A group conversation requires at least two other participants.",
          });
        }

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
      const membership = alias(conversationParticipants, "membership");
      const conversation = alias(conversations, "conversation");
      const latestMessage = alias(messages, "latest_message");
      const peerMembership = alias(conversationParticipants, "peer_membership");
      const peerProfile = alias(profiles, "peer_profile");
      const result = await db.execute(sql`
        select
          ${conversation.id},
          ${conversation.is_group},
          ${conversation.group_name},
          ${conversation.created_at},
          ${conversation.last_message_at},
          coalesce(unread_counts.unread_count, 0) as unread_count,
          ${latestMessage.id} as last_message_id,
          ${latestMessage.conversation_id} as last_message_conversation_id,
          ${latestMessage.sender_id} as last_message_sender_id,
          ${latestMessage.content} as last_message_content,
          ${latestMessage.created_at} as last_message_created_at,
          ${latestMessage.deleted_at} as last_message_deleted_at,
          ${peerProfile.id} as peer_profile_id,
          ${peerProfile.username} as peer_profile_username,
          ${peerProfile.full_name} as peer_profile_full_name,
          ${peerProfile.avatar_url} as peer_profile_avatar_url
        from ${conversationParticipants} as ${sql.identifier("membership")}
        inner join ${conversations} as ${sql.identifier("conversation")} on ${conversation.id} = ${membership.conversation_id}
        left join lateral (
          select count(*) as unread_count
          from ${messages}
          where ${messages.conversation_id} = ${conversation.id}
            and ${messages.sender_id} <> ${ctx.session.user.id}
            and ${messages.deleted_at} is null
            and (
              ${membership.last_read_at} is null
              or (${messages.created_at}, ${messages.id}) > (
                ${membership.last_read_at},
                ${membership.last_read_message_id}
              )
            )
        ) unread_counts on true
        left join lateral (
          select ${latestMessage.id}, ${latestMessage.conversation_id}, ${latestMessage.sender_id}, ${latestMessage.content}, ${latestMessage.created_at}, ${latestMessage.deleted_at}
          from ${messages} as ${sql.identifier("latest_message")}
          where ${latestMessage.conversation_id} = ${conversation.id}
          order by ${latestMessage.created_at} desc, ${latestMessage.id} desc
          limit 1
        ) latest_message on true
        left join lateral (
          select ${peerProfile.id}, ${peerProfile.username}, ${peerProfile.full_name}, ${peerProfile.avatar_url}
          from ${conversationParticipants} as ${sql.identifier("peer_membership")}
          inner join ${profiles} as ${sql.identifier("peer_profile")} on ${peerProfile.id} = ${peerMembership.user_id}
          where ${peerMembership.conversation_id} = ${conversation.id}
            and ${peerMembership.user_id} <> ${ctx.session.user.id}
          order by ${peerMembership.user_id} asc
          limit 1
        ) peer_profile on true
        where ${membership.user_id} = ${ctx.session.user.id}
        order by ${conversation.last_message_at} desc nulls last, ${conversation.created_at} desc
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
                avatar_url: resolveProfileMediaUrl(
                  row.peer_profile_avatar_url,
                  row.peer_profile_id,
                ),
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
        message: "Failed to load conversations.",
        cause: error,
      });
    }
  }),

  getMessages: protectedProcedure.input(getMessagesInputSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);

    try {
      return await getConversationMessagesForViewer(db, {
        conversationId: input.conversation_id,
        viewerId: ctx.session.user.id,
      });
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

  sendMessage: protectedProcedure
    .input(createMessageInputSchema)
    .output(sendMessageOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      try {
        return await db.transaction((tx) =>
          executeWithOperationReceipt({
            tx,
            actorId: ctx.session.user.id,
            ...(input.operation_id ? { operationId: input.operation_id } : {}),
            command: "chatbot.messaging.send-message",
            semanticInput: { conversation_id: input.conversation_id, content: input.content },
            output: sendMessageOutputSchema,
            authorize: (executor) =>
              isConversationParticipant(executor, {
                conversationId: input.conversation_id,
                userId: ctx.session.user.id,
              }),
            mutate: async (executor) => {
              await executor.insert(messages).values({
                conversation_id: input.conversation_id,
                sender_id: ctx.session.user.id,
                content: input.content,
              });
              await executor
                .update(conversations)
                .set({ last_message_at: new Date() })
                .where(eq(conversations.id, input.conversation_id));
              return { success: true } as const;
            },
          }),
        );
      } catch (error) {
        if (error instanceof OperationReceiptConflictError) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Operation ID was already used differently.",
          });
        }
        if (error instanceof OperationReceiptUnauthorizedError) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
        }
        if (error instanceof OperationReceiptCorruptError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Operation receipt is invalid.",
          });
        }
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

  markAsRead: protectedProcedure.input(markAsReadInputSchema).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);

    try {
      const participant = alias(conversationParticipants, "participant");
      const message = alias(messages, "message");
      const result = await db.execute(sql`
        with target as (
          select
            ${participant.conversation_id},
            ${participant.user_id},
            latest_message.created_at as latest_created_at,
            latest_message.id as latest_message_id
          from ${conversationParticipants} as ${sql.identifier("participant")}
          left join lateral (
            select ${message.created_at}, ${message.id}
            from ${messages} as ${sql.identifier("message")}
            where ${message.conversation_id} = ${participant.conversation_id}
              and ${message.sender_id} <> ${participant.user_id}
              and ${message.deleted_at} is null
            order by ${message.created_at} desc, ${message.id} desc
            limit 1
          ) latest_message on true
          where ${participant.conversation_id} = ${input.conversation_id}
            and ${participant.user_id} = ${ctx.session.user.id}
        )
        update ${conversationParticipants} as ${sql.identifier("participant")}
        set
          last_read_at = case
            when target.latest_message_id is not null and (
              ${participant.last_read_at} is null
              or (target.latest_created_at, target.latest_message_id) > (
                ${participant.last_read_at},
                ${participant.last_read_message_id}
              )
            ) then target.latest_created_at
            else ${participant.last_read_at}
          end,
          last_read_message_id = case
            when target.latest_message_id is not null and (
              ${participant.last_read_at} is null
              or (target.latest_created_at, target.latest_message_id) > (
                ${participant.last_read_at},
                ${participant.last_read_message_id}
              )
            ) then target.latest_message_id
            else ${participant.last_read_message_id}
          end
        from target
        where ${participant.conversation_id} = target.conversation_id
          and ${participant.user_id} = target.user_id
        returning ${participant.conversation_id}
      `);

      const markedConversation = result.rows[0]
        ? markedConversationSchema.parse(result.rows[0])
        : null;
      if (!markedConversation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
      }

      return { success: true };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to mark conversation as read.",
        cause: error,
      });
    }
  }),

  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const db = getRequiredDb(ctx);

    try {
      const [result] = await db
        .select({ unread_count: count() })
        .from(conversationParticipants)
        .innerJoin(messages, eq(messages.conversation_id, conversationParticipants.conversation_id))
        .where(
          and(
            eq(conversationParticipants.user_id, ctx.session.user.id),
            ne(messages.sender_id, conversationParticipants.user_id),
            isNull(messages.deleted_at),
            or(
              isNull(conversationParticipants.last_read_at),
              sql`(${messages.created_at}, ${messages.id}) > (${conversationParticipants.last_read_at}, ${conversationParticipants.last_read_message_id})`,
            ),
          ),
        );

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
