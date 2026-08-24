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
    await this.database.transaction(async (query) => {
      await query.query(
        `insert into "groups" (
           "id", "created_by_profile_id", "name", "slug", "description", "access_level", "join_policy"
         ) values ($1, $2, $3, $4, 'Exact-ID browser fixture.', 'public', $5)`,
        [id, actor.profileId, name, slug, input.joinPolicy ?? "open"],
      );
      await query.query(
        `insert into "group_memberships" ("group_id", "profile_id", "role", "status")
         values ($1, $2, 'owner', 'active')`,
        [id, actor.profileId],
      );
    });
    this.register(id, actor.profileId);
    return { id, name, url: `/groups/${id}` };
  }

  register(id: string, ownerProfileId?: string) {
    this.cleanup.registerExactId({
      kind: "group",
      id,
      cleanup: async (database) => {
        await database.transaction(async (query) => {
          await query.query(
            `delete from "comments" where "entity_type" = 'event' and "entity_id" in
              (select "id" from "group_events" where "group_id" = $1)`,
            [id],
          );
          await query.query(
            `delete from "groups" where "id" = $1
              and ($2::uuid is null or "created_by_profile_id" = $2)`,
            [id, ownerProfileId ?? null],
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
    await this.database.query(
      `insert into "follows" ("follower_id", "following_id", "status", "created_at", "updated_at")
       values ($1, $2, $3, now(), now())
       on conflict ("follower_id", "following_id") do update
       set "status" = excluded."status", "updated_at" = now()`,
      [follower.profileId, following.profileId, input.status ?? "accepted"],
    );
    const id = `${follower.profileId}:${following.profileId}`;
    this.cleanup.registerExactId({
      kind: "follow",
      id,
      cleanup: (database) =>
        database
          .query('delete from "follows" where "follower_id" = $1 and "following_id" = $2', [
            follower.profileId,
            following.profileId,
          ])
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
    await this.database.query(
      `insert into "comments" ("id", "profile_id", "entity_type", "entity_id", "content", "created_at", "updated_at")
       values ($1, $2, $3, $4, $5, now(), now())`,
      [
        id,
        actor.profileId,
        input.entityType,
        input.entityId,
        input.content ?? this.identity.name("Playwright comment"),
      ],
    );
    this.cleanup.registerExactId({
      kind: "comment",
      id,
      cleanup: (database) =>
        database.query('delete from "comments" where "id" = $1', [id]).then(() => undefined),
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
    const participants = await Promise.all(
      input.participantEmails.map((email) => this.database.requireActorByEmail(email)),
    );
    await this.database.transaction(async (query) => {
      await query.query(
        `insert into "conversations" ("id", "is_group", "group_name", "created_at", "last_message_at")
         values ($1, $2, $3, now(), now())`,
        [id, participants.length > 2, participants.length > 2 ? name : null],
      );
      for (const actor of participants) {
        await query.query(
          `insert into "conversation_participants" ("conversation_id", "user_id") values ($1, $2)`,
          [id, actor.profileId],
        );
      }
      await query.query(
        `insert into "messages" ("id", "conversation_id", "sender_id", "content", "created_at")
         values ($1, $2, $3, $4, now())`,
        [messageId, id, participants[0]?.profileId, this.identity.name("Playwright message")],
      );
    });
    this.register(id);
    return { id, messageId, name, url: `/messages/${id}` };
  }

  register(id: string) {
    this.cleanup.registerExactId({
      kind: "conversation",
      id,
      cleanup: (database) =>
        database.query('delete from "conversations" where "id" = $1', [id]).then(() => undefined),
    });
  }
}
