import { createHash } from "node:crypto";
import {
  activityPlanAdaptationSchema,
  activityPlanSemanticHash,
  activityPlanStructureSchema,
  activityPlanTrainingIntentSchema,
  getCanonicalActivityPlanStructureHashInput,
} from "@repo/core/activity-plan";
import { completedSegmentSummarySchema } from "@repo/core/activity-segments";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import {
  type ActivityInsert,
  type ActivityPlanInsert,
  type ActivityRouteInsert,
  type ActivitySegmentInsert,
  activities,
  activityPlans,
  activityRoutes,
  activitySegments,
  comments,
  events,
  likes,
  plannedSessions,
} from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import type { E2ECleanupRegistry } from "../cleanup";
import type { LocalE2EDatabase } from "../database";
import type { E2EExecutionIdentity } from "../identity";
import { utcDateTime } from "../identity";

function activityPlanStructureHash(structure: unknown) {
  return `v1:sha256:${createHash("sha256")
    .update(getCanonicalActivityPlanStructureHashInput(structure))
    .digest("hex")}`;
}

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
    const segmentId = this.identity.uuid(`${label}-segment`);
    const name = input.name ?? this.identity.name(`Playwright ${label}`);
    const date = input.date ?? this.identity.calendarDate(label);
    const actor = await this.database.requireActorByEmail(input.actorEmail);
    const startedAt = new Date(utcDateTime(date));
    const finishedAt = new Date(utcDateTime(date, "10:00:00"));
    const activity: ActivityInsert = {
      id,
      profile_id: actor.profileId,
      name,
      started_at: startedAt,
      finished_at: finishedAt,
      elapsed_ms: 3_600_000,
      active_ms: 3_600_000,
      moving_ms: 3_600_000,
      timing_coverage: "complete",
      parser_version: "e2e-fixture-v1",
      decoded_contract_version: "e2e-fixture-v1",
      materializer_version: "e2e-fixture-v1",
      segments_generated_at: finishedAt,
      entry_provenance: null,
      distance_meters: 10_000,
    };
    const summary = completedSegmentSummarySchema.parse({
      version: 1,
      timing: { timingCoverage: "complete", activeMs: 3_600_000, movingMs: 3_600_000 },
      normalizedPowerResult: calculateCyclingNormalizedPower({ samples: [] }),
    });
    const segment: ActivitySegmentInsert = {
      id: segmentId,
      activity_id: id,
      profile_id: actor.profileId,
      ordinal: 0,
      role: "activity",
      activity_category: "bike",
      start_offset_ms: 0,
      end_offset_ms: 3_600_000,
      summary,
      summary_version: 1,
      timing_coverage: "complete",
      active_ms: 3_600_000,
      moving_ms: 3_600_000,
      segment_revision: 1,
      parser_version: "e2e-fixture-v1",
      materializer_version: "e2e-fixture-v1",
    };
    await this.database.typedTransaction(async (database) => {
      await database.insert(activities).values(activity);
      await database.insert(activitySegments).values(segment);
    });
    this.register(id, actor.profileId);
    return { id, name, url: `/activities/${id}` };
  }

  register(id: string, profileId?: string) {
    this.cleanup.registerExactId({
      kind: "activity",
      id,
      cleanup: async (database) => {
        await database.typedTransaction(async (transaction) => {
          await transaction
            .delete(comments)
            .where(and(eq(comments.entity_type, "activity"), eq(comments.entity_id, id)));
          await transaction
            .delete(likes)
            .where(and(eq(likes.entity_type, "activity"), eq(likes.entity_id, id)));
          await transaction
            .delete(activities)
            .where(
              profileId
                ? and(eq(activities.id, id), eq(activities.profile_id, profileId))
                : eq(activities.id, id),
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
    const parsedStructure = activityPlanStructureSchema.parse(structure);
    const adaptation = activityPlanAdaptationSchema.nullable().parse(null);
    const trainingIntent = activityPlanTrainingIntentSchema.parse("general_maintenance");
    const activityPlan: ActivityPlanInsert = {
      id,
      profile_id: actor.profileId,
      name,
      description: "Exact-ID browser fixture.",
      notes: "Bring bottles",
      structure: parsedStructure,
      adaptation,
      structure_hash: activityPlanStructureHash(parsedStructure),
      semantic_hash: activityPlanSemanticHash({
        structure: parsedStructure,
        adaptation,
        trainingIntent,
      }),
      training_intent: trainingIntent,
      gps_recording_enabled: true,
      content_visibility: input.visibility ?? "private",
      is_system_template: false,
    };
    await this.database.db.insert(activityPlans).values(activityPlan);
    this.register(id, actor.profileId);
    return { id, name, url: `/activity-plans/${id}` };
  }

  register(id: string, profileId?: string) {
    this.cleanup.registerExactId({
      kind: "activity-plan",
      id,
      cleanup: async (database) => {
        await database.typedTransaction(async (transaction) => {
          await transaction.delete(plannedSessions).where(eq(plannedSessions.activity_plan_id, id));
          await transaction
            .delete(comments)
            .where(and(eq(comments.entity_type, "activity_plan"), eq(comments.entity_id, id)));
          await transaction
            .delete(likes)
            .where(and(eq(likes.entity_type, "activity_plan"), eq(likes.entity_id, id)));
          await transaction
            .delete(activityPlans)
            .where(
              profileId
                ? and(eq(activityPlans.id, id), eq(activityPlans.profile_id, profileId))
                : eq(activityPlans.id, id),
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

  async create(input: OwnedInput & { isPublic?: boolean }): Promise<FixtureRecord> {
    const label = input.label ?? "route";
    const id = this.identity.uuid(label);
    const name = input.name ?? this.identity.name(`Playwright ${label}`);
    const actor = await this.database.requireActorByEmail(input.actorEmail);
    const route: ActivityRouteInsert = {
      id,
      profile_id: actor.profileId,
      name,
      description: "Exact-ID browser fixture.",
      file_path: `e2e/${id}.gpx`,
      storage_state: "ready",
      total_distance: 10_000,
      total_ascent: 120,
      total_descent: 110,
      polyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
      is_public: input.isPublic ?? false,
    };
    await this.database.db.insert(activityRoutes).values(route);
    this.register(id, actor.profileId);
    return { id, name, url: `/routes/${id}` };
  }

  register(id: string, profileId?: string) {
    this.cleanup.registerExactId({
      kind: "activity-route",
      id,
      cleanup: async (database) => {
        await database.typedTransaction(async (transaction) => {
          await transaction.update(events).set({ route_id: null }).where(eq(events.route_id, id));
          await transaction
            .delete(comments)
            .where(and(eq(comments.entity_type, "route"), eq(comments.entity_id, id)));
          await transaction
            .delete(likes)
            .where(and(eq(likes.entity_type, "route"), eq(likes.entity_id, id)));
          await transaction
            .delete(activityRoutes)
            .where(
              profileId
                ? and(eq(activityRoutes.id, id), eq(activityRoutes.profile_id, profileId))
                : eq(activityRoutes.id, id),
            );
        });
      },
    });
  }
}
