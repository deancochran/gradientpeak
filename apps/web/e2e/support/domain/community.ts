import {
  comments,
  conversationParticipants,
  conversations,
  follows,
  groupEvents,
  groupMemberships,
  groups,
  messages,
} from "@repo/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { E2ECleanupRegistry } from "../cleanup";
import type { LocalE2EDatabase } from "../database";
import type { E2EExecutionIdentity } from "../identity";

type FixtureRecord = { id: string; name: string; url: string };

export class GroupFixtureBuilder {
  constructor(
    private readonly database: LocalE2EDatabase,
    private readonly cleanup: E2ECleanupRegistry,
    private readonly identity: E2EExecutionIdentity,
  ) {}

  async create(input: {
    actorEmail: string;
    joinPolicy?: "open" | "request_to_join" | "invite_only";
    label?: string;
    name?: string;
  }): Promise<FixtureRecord> {
    const label = input.label ?? "group";
    const id = this.identity.uuid(label);
    const name = input.name ?? this.identity.name(`Playwright ${label}`);
    const slug = this.identity.slug(label);
    const actor = await this.database.requireActorByEmail(input.actorEmail);
    await this.database.typedTransaction(async (database) => {
      await database.insert(groups).values({
        id,
        created_by_profile_id: actor.profileId,
        name,
        slug,
        description: "Exact-ID browser fixture.",
        access_level: "public",
        join_policy: input.joinPolicy ?? "open",
      });
      await database
        .insert(groupMemberships)
        .values({ group_id: id, profile_id: actor.profileId, role: "owner", status: "active" });
    });
    this.register(id, actor.profileId);
    return { id, name, url: `/groups/${id}` };
  }

  register(id: string, ownerProfileId?: string) {
    this.cleanup.registerExactId({
      kind: "group",
      id,
      cleanup: async (database) => {
        await database.typedTransaction(async (transaction) => {
          const events = await transaction
            .select({ id: groupEvents.id })
            .from(groupEvents)
            .where(eq(groupEvents.group_id, id));
          if (events.length)
            await transaction.delete(comments).where(
              and(
                eq(comments.entity_type, "event"),
                inArray(
                  comments.entity_id,
                  events.map((event) => event.id),
                ),
              ),
            );
          await transaction
            .delete(groups)
            .where(
              ownerProfileId
                ? and(eq(groups.id, id), eq(groups.created_by_profile_id, ownerProfileId))
                : eq(groups.id, id),
            );
        });
      },
    });
  }
}

export class SocialFixtureBuilder {
  constructor(
    private readonly database: LocalE2EDatabase,
    private readonly cleanup: E2ECleanupRegistry,
    private readonly identity: E2EExecutionIdentity,
  ) {}

  async createFollow(input: {
    followerEmail: string;
    followingEmail: string;
    status?: "accepted" | "pending";
  }) {
    const follower = await this.database.requireActorByEmail(input.followerEmail);
    const following = await this.database.requireActorByEmail(input.followingEmail);
    const now = new Date();
    await this.database.db
      .insert(follows)
      .values({
        follower_id: follower.profileId,
        following_id: following.profileId,
        status: input.status ?? "accepted",
        created_at: now,
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: [follows.follower_id, follows.following_id],
        set: { status: input.status ?? "accepted", updated_at: now },
      });
    const id = `${follower.profileId}:${following.profileId}`;
    this.cleanup.registerExactId({
      kind: "follow",
      id,
      cleanup: (database) =>
        database.db
          .delete(follows)
          .where(
            and(
              eq(follows.follower_id, follower.profileId),
              eq(follows.following_id, following.profileId),
            ),
          )
          .then(() => undefined),
    });
    return {
      followerId: follower.profileId,
      followingId: following.profileId,
      id,
      url: `/profiles/${following.profileId}`,
    };
  }

  async createComment(input: {
    actorEmail: string;
    content?: string;
    entityId: string;
    entityType: "activity" | "activity_plan" | "event" | "route";
    label?: string;
  }) {
    const label = input.label ?? "comment";
    const id = this.identity.uuid(label);
    const actor = await this.database.requireActorByEmail(input.actorEmail);
    const now = new Date();
    await this.database.db.insert(comments).values({
      id,
      profile_id: actor.profileId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      content: input.content ?? this.identity.name("Playwright comment"),
      created_at: now,
      updated_at: now,
    });
    this.cleanup.registerExactId({
      kind: "comment",
      id,
      cleanup: (database) =>
        database.db
          .delete(comments)
          .where(eq(comments.id, id))
          .then(() => undefined),
    });
    return {
      id,
      name: input.content ?? "Playwright comment",
      url: `/${input.entityType}/${input.entityId}`,
    };
  }
}

export class MessagingFixtureBuilder {
  constructor(
    private readonly database: LocalE2EDatabase,
    private readonly cleanup: E2ECleanupRegistry,
    private readonly identity: E2EExecutionIdentity,
  ) {}

  async createConversation(input: {
    label?: string;
    participantEmails: readonly [string, string, ...string[]];
  }): Promise<FixtureRecord & { messageId: string }> {
    const label = input.label ?? "conversation";
    const id = this.identity.uuid(label);
    const messageId = this.identity.uuid(`${label}-message`);
    const name = this.identity.name(`Playwright ${label}`);
    const [senderEmail, ...recipientEmails] = input.participantEmails;
    const sender = await this.database.requireActorByEmail(senderEmail);
    const participants = [
      sender,
      ...(await Promise.all(
        recipientEmails.map((email) => this.database.requireActorByEmail(email)),
      )),
    ];
    await this.database.typedTransaction(async (database) => {
      await database.insert(conversations).values({
        id,
        is_group: participants.length > 2,
        group_name: participants.length > 2 ? name : null,
        last_message_at: new Date(),
      });
      for (const actor of participants) {
        await database
          .insert(conversationParticipants)
          .values({ conversation_id: id, user_id: actor.profileId });
      }
      await database.insert(messages).values({
        id: messageId,
        conversation_id: id,
        sender_id: sender.profileId,
        content: this.identity.name("Playwright message"),
      });
    });
    this.register(id);
    return { id, messageId, name, url: `/messages/${id}` };
  }

  register(id: string) {
    this.cleanup.registerExactId({
      kind: "conversation",
      id,
      cleanup: (database) =>
        database.db
          .delete(conversations)
          .where(eq(conversations.id, id))
          .then(() => undefined),
    });
  }
}
