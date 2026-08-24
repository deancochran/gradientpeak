import type { E2ECleanupRegistry } from "../cleanup";
import type { LocalE2EDatabase } from "../database";
import type { E2EExecutionIdentity } from "../identity";
import { utcDateTime } from "../identity";
import { fixtureStructureHash } from "./shared";

type FixtureRecord = { id: string; name: string; url: string };

export class CalendarFixtureBuilder {
  constructor(
    private readonly database: LocalE2EDatabase,
    private readonly cleanup: E2ECleanupRegistry,
    private readonly identity: E2EExecutionIdentity,
  ) {}

  async createEvent(input: {
    actorEmail: string;
    date?: string;
    label?: string;
    title?: string;
  }): Promise<FixtureRecord & { date: string }> {
    const label = input.label ?? "calendar-event";
    const id = this.identity.uuid(label);
    const name = input.title ?? this.identity.name(`Playwright ${label}`);
    const date = input.date ?? this.identity.calendarDate(label);
    const actor = await this.database.requireActorByEmail(input.actorEmail);
    await this.database.query(
      `insert into "events" (
         "id", "profile_id", "event_type", "status", "title", "all_day", "timezone",
         "starts_at", "ends_at", "scheduled_date"
       ) values ($1, $2, 'custom', 'scheduled', $3, false, 'UTC', $4::timestamptz, $5::timestamptz, $6)`,
      [id, actor.profileId, name, utcDateTime(date), utcDateTime(date, "10:00:00"), date],
    );
    this.registerEvent(id, actor.profileId);
    return { date, id, name, url: `/calendar/events/${id}` };
  }

  registerEvent(id: string, profileId?: string) {
    this.cleanup.registerExactId({
      kind: "calendar-event",
      id,
      cleanup: async (database) => {
        await database.transaction(async (query) => {
          await query.query(
            `delete from "comments" where "entity_type" = 'event' and "entity_id" in
              (select "id" from "events" where "id" = $1 or "series_id" = $1)`,
            [id],
          );
          await query.query(
            `delete from "events" where ("id" = $1 or "series_id" = $1)
              and ($2::uuid is null or "profile_id" = $2)`,
            [id, profileId ?? null],
          );
        });
      },
    });
  }
}

export class TrainingPlanFixtureBuilder {
  constructor(
    private readonly database: LocalE2EDatabase,
    private readonly cleanup: E2ECleanupRegistry,
    private readonly identity: E2EExecutionIdentity,
  ) {}

  async create(input: {
    activityPlanId: string;
    actorEmail: string;
    label?: string;
    name?: string;
    visibility?: "private" | "followers" | "public";
  }): Promise<FixtureRecord> {
    const label = input.label ?? "training-plan";
    const id = this.identity.uuid(label);
    const name = input.name ?? this.identity.name(`Playwright ${label}`);
    const actor = await this.database.requireActorByEmail(input.actorEmail);
    const structure = {
      id,
      version: 1,
      sessions: [
        {
          activity_plan_id: input.activityPlanId,
          offset_days: 0,
          event_overrides: { title: "Playwright tempo" },
        },
      ],
    };
    await this.database.query(
      `insert into "training_plans" (
         "id", "profile_id", "name", "description", "structure", "structure_hash",
         "content_visibility", "is_system_template"
       ) values ($1, $2, $3, 'Exact-ID browser fixture.', $4::jsonb, $5, $6, false)`,
      [
        id,
        actor.profileId,
        name,
        JSON.stringify(structure),
        fixtureStructureHash(structure),
        input.visibility ?? "private",
      ],
    );
    this.register(id, actor.profileId);
    return { id, name, url: `/training-plans/${id}` };
  }

  register(id: string, profileId: string) {
    this.cleanup.registerExactId({
      kind: "training-plan",
      id,
      cleanup: async (database) => {
        await database.transaction(async (query) => {
          await query.query(
            'delete from "events" where "training_plan_id" = $1 and "profile_id" = $2',
            [id, profileId],
          );
          await query.query(
            `delete from "training_plans"
             where "id" = $1 and "profile_id" = $2 and "is_system_template" = false`,
            [id, profileId],
          );
        });
      },
    });
  }
}
