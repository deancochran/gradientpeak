import type { E2ECleanupRegistry } from "../cleanup";
import type { LocalE2EDatabase } from "../database";
import type { E2EExecutionIdentity } from "../identity";
import { utcDateTime } from "../identity";
import { fixtureStructureHash } from "./shared";

type OwnedInput = { actorEmail: string; label?: string; name?: string };
type FixtureRecord = { id: string; name: string; url: string };

export class ActivityFixtureBuilder {
  constructor(
    private readonly database: LocalE2EDatabase,
    private readonly cleanup: E2ECleanupRegistry,
    private readonly identity: E2EExecutionIdentity,
  ) {}

  async create(input: OwnedInput & { date?: string }): Promise<FixtureRecord> {
    const label = input.label ?? "activity";
    const id = this.identity.uuid(label);
    const name = input.name ?? this.identity.name(`Playwright ${label}`);
    const date = input.date ?? this.identity.calendarDate(label);
    const actor = await this.database.requireActorByEmail(input.actorEmail);
    await this.database.query(
      `insert into "activities" (
         "id", "profile_id", "name", "started_at", "finished_at", "elapsed_ms",
         "active_ms", "moving_ms", "timing_coverage", "parser_version",
         "decoded_contract_version", "materializer_version", "segments_generated_at"
       ) values ($1, $2, $3, $4::timestamptz, $5::timestamptz, 3600000,
         3600000, 3600000, 'complete', 'e2e-fixture-v1', 'e2e-fixture-v1',
         'e2e-fixture-v1', $5::timestamptz)`,
      [id, actor.profileId, name, utcDateTime(date), utcDateTime(date, "10:00:00")],
    );
    this.register(id, actor.profileId);
    return { id, name, url: `/activities/${id}` };
  }

  register(id: string, profileId?: string) {
    this.cleanup.registerExactId({
      kind: "activity",
      id,
      cleanup: async (database) => {
        await database.transaction(async (query) => {
          await query.query(
            `delete from "comments" where "entity_type" = 'activity' and "entity_id" = $1`,
            [id],
          );
          await query.query(
            `delete from "likes" where "entity_type" = 'activity' and "entity_id" = $1`,
            [id],
          );
          await query.query(
            `delete from "activities" where "id" = $1 and ($2::uuid is null or "profile_id" = $2)`,
            [id, profileId ?? null],
          );
        });
      },
    });
  }
}

export class ActivityPlanFixtureBuilder {
  constructor(
    private readonly database: LocalE2EDatabase,
    private readonly cleanup: E2ECleanupRegistry,
    private readonly identity: E2EExecutionIdentity,
  ) {}

  async create(
    input: OwnedInput & { visibility?: "private" | "followers" | "public" },
  ): Promise<FixtureRecord> {
    const label = input.label ?? "activity-plan";
    const id = this.identity.uuid(label);
    const name = input.name ?? this.identity.name(`Playwright ${label}`);
    const actor = await this.database.requireActorByEmail(input.actorEmail);
    const structure = {
      version: 3,
      activity_category: "bike",
      segments: [
        {
          id: this.identity.uuid(`${label}-segment`),
          role: "activity",
          name: "Tempo ride",
          intervals: [
            {
              id: this.identity.uuid(`${label}-interval`),
              name: "Main set",
              repetitions: 1,
              steps: [
                {
                  id: this.identity.uuid(`${label}-step`),
                  name: "Tempo",
                  duration: { type: "time", seconds: 1_800 },
                  targets: [{ type: "%FTP", intensity: 75 }],
                },
              ],
            },
          ],
        },
      ],
    };
    await this.database.query(
      `insert into "activity_plans" (
         "id", "profile_id", "name", "description", "notes", "structure", "structure_hash",
         "gps_recording_enabled", "content_visibility", "is_system_template"
       ) values ($1, $2, $3, 'Exact-ID browser fixture.', 'Bring bottles', $4::jsonb, $5, true, $6, false)`,
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
    return { id, name, url: `/activity-plans/${id}` };
  }

  register(id: string, profileId?: string) {
    this.cleanup.registerExactId({
      kind: "activity-plan",
      id,
      cleanup: async (database) => {
        await database.transaction(async (query) => {
          await query.query(
            `delete from "comments" where "entity_type" = 'event' and "entity_id" in
              (select "id" from "events" where "activity_plan_id" = $1)`,
            [id],
          );
          await query.query('delete from "events" where "activity_plan_id" = $1', [id]);
          await query.query(
            `delete from "comments" where "entity_type" = 'activity_plan' and "entity_id" = $1`,
            [id],
          );
          await query.query(
            `delete from "likes" where "entity_type" = 'activity_plan' and "entity_id" = $1`,
            [id],
          );
          await query.query(
            `delete from "activity_plans" where "id" = $1 and ($2::uuid is null or "profile_id" = $2)`,
            [id, profileId ?? null],
          );
        });
      },
    });
  }
}

export class RouteFixtureBuilder {
  constructor(
    private readonly database: LocalE2EDatabase,
    private readonly cleanup: E2ECleanupRegistry,
    private readonly identity: E2EExecutionIdentity,
  ) {}

  async create(input: OwnedInput): Promise<FixtureRecord> {
    const label = input.label ?? "route";
    const id = this.identity.uuid(label);
    const name = input.name ?? this.identity.name(`Playwright ${label}`);
    const actor = await this.database.requireActorByEmail(input.actorEmail);
    await this.database.query(
      `insert into "activity_routes" (
         "id", "profile_id", "name", "description", "file_path", "storage_state",
         "total_distance", "total_ascent", "total_descent", "polyline", "is_public"
       ) values ($1, $2, $3, 'Exact-ID browser fixture.', $4, 'ready', 10000, 120, 110, $5, false)`,
      [id, actor.profileId, name, `e2e/${id}.gpx`, "_p~iF~ps|U_ulLnnqC_mqNvxq`@"],
    );
    this.register(id, actor.profileId);
    return { id, name, url: `/routes/${id}` };
  }

  register(id: string, profileId?: string) {
    this.cleanup.registerExactId({
      kind: "activity-route",
      id,
      cleanup: async (database) => {
        await database.transaction(async (query) => {
          await query.query('update "events" set "route_id" = null where "route_id" = $1', [id]);
          await query.query(
            `delete from "comments" where "entity_type" = 'route' and "entity_id" = $1`,
            [id],
          );
          await query.query(
            `delete from "likes" where "entity_type" = 'route' and "entity_id" = $1`,
            [id],
          );
          await query.query(
            `delete from "activity_routes" where "id" = $1 and ($2::uuid is null or "profile_id" = $2)`,
            [id, profileId ?? null],
          );
        });
      },
    });
  }
}
