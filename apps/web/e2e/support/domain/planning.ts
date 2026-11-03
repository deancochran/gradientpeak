import { comments, events, plannedSessions, trainingPlans } from "@repo/db/schema";
import { and, eq, inArray, or } from "drizzle-orm";
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
    await this.database.db.insert(events).values({
      id,
      profile_id: actor.profileId,
      event_type: "custom",
      status: "scheduled",
      title: name,
      all_day: false,
      timezone: "UTC",
      starts_at: new Date(utcDateTime(date)),
      ends_at: new Date(utcDateTime(date, "10:00:00")),
      scheduled_date: date,
    });
    this.registerEvent(id, actor.profileId);
    return { date, id, name, url: `/calendar/events/${id}` };
  }

  registerEvent(id: string, profileId?: string) {
    this.cleanup.registerExactId({
      kind: "calendar-event",
      id,
      cleanup: async (database) => {
        await database.typedTransaction(async (transaction) => {
          const matchingEvents = await transaction
            .select({ id: events.id })
            .from(events)
            .where(or(eq(events.id, id), eq(events.series_id, id)));
          if (matchingEvents.length)
            await transaction.delete(comments).where(
              and(
                eq(comments.entity_type, "event"),
                inArray(
                  comments.entity_id,
                  matchingEvents.map((event) => event.id),
                ),
              ),
            );
          await transaction
            .delete(events)
            .where(
              and(
                or(eq(events.id, id), eq(events.series_id, id)),
                ...(profileId ? [eq(events.profile_id, profileId)] : []),
              ),
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
      plan_preferences: {
        weekly_session_count: null,
        target_weekly_duration_minutes: null,
        maximum_session_duration_minutes: null,
        preferred_weekdays: [],
        rest_days: [],
        progression_style: null,
        recovery_priority: null,
      },
      sessions: [
        {
          id: this.identity.uuid(`${label}-session`),
          activity_plan_id: input.activityPlanId,
          offset_days: 0,
          demand: {
            activity_category: "bike",
            training_intent: "aerobic_base",
            target_duration_minutes: 60,
            target_common_load: null,
            importance: "normal",
          },
          event_overrides: { title: "Playwright tempo" },
        },
      ],
    };
    await this.database.db.insert(trainingPlans).values({
      id,
      profile_id: actor.profileId,
      name,
      description: "Exact-ID browser fixture.",
      structure,
      structure_hash: fixtureStructureHash(structure),
      content_visibility: input.visibility ?? "private",
      is_system_template: false,
    });
    this.register(id, actor.profileId);
    return { id, name, url: `/training-plans/${id}` };
  }

  register(id: string, profileId: string) {
    this.cleanup.registerExactId({
      kind: "training-plan",
      id,
      cleanup: async (database) => {
        await database.typedTransaction(async (transaction) => {
          await transaction
            .delete(plannedSessions)
            .where(
              and(
                eq(plannedSessions.training_plan_id, id),
                eq(plannedSessions.profile_id, profileId),
              ),
            );
          await transaction
            .delete(trainingPlans)
            .where(
              and(
                eq(trainingPlans.id, id),
                eq(trainingPlans.profile_id, profileId),
                eq(trainingPlans.is_system_template, false),
              ),
            );
        });
      },
    });
  }
}
