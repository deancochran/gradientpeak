import { createHash } from "node:crypto";
import type { TestInfo } from "@playwright/test";
import {
  activityPlanStructureSchema,
  canonicalTrainingPlanStructureSchema,
  persistedTrainingPlanStructureSchema,
} from "@repo/core";
import { activityPlans, profileAthleteState, profiles, trainingPlans } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { AuthenticatedE2EActor } from "../support/actors";
import { currentE2ECleanupRegistry } from "../support/cleanup";
import { LocalE2EDatabase } from "../support/database";
import { createE2EExecutionIdentity } from "../support/identity";
import { registerTrainingPlanCleanup } from "./cleanup";

type TrainingPlanNames = { ownedName: string; templateName: string };
type TrainingPlanFixture = TrainingPlanNames & {
  ownedId: string;
  scheduledActivityPlanName: string;
};

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Fixture contains a non-finite number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  throw new Error(`Fixture contains unsupported ${typeof value}.`);
}

function structureHash(structure: unknown) {
  return `v1:sha256:${createHash("sha256").update(canonicalJson(structure)).digest("hex")}`;
}

function fixtureNames(testInfo: TestInfo): TrainingPlanNames {
  const identity = createE2EExecutionIdentity(testInfo);
  return {
    ownedName: identity.name("Playwright Training Plan"),
    templateName: identity.name("Playwright Training Template"),
  };
}

function actorActivityPlanId(actor: AuthenticatedE2EActor) {
  const id = actor.activityPlanId;
  if (!id) throw new Error("The isolated athlete activity plan was not provisioned.");
  return id;
}

async function normalizeSeededActivityPlanHash(database: LocalE2EDatabase, activityPlanId: string) {
  const [original] = await database.db
    .select({
      contentVisibility: activityPlans.content_visibility,
      name: activityPlans.name,
      structure: activityPlans.structure,
      structureHash: activityPlans.structure_hash,
    })
    .from(activityPlans)
    .where(eq(activityPlans.id, activityPlanId))
    .limit(1);
  const parsed = activityPlanStructureSchema.safeParse(original?.structure);
  if (!parsed.success || !original)
    throw new Error(
      "The local training-plan activity fixture is not a current activity-plan structure.",
    );
  await database.typedTransaction((transaction) =>
    transaction
      .update(activityPlans)
      .set({ structure_hash: structureHash(parsed.data), content_visibility: "public" })
      .where(eq(activityPlans.id, activityPlanId)),
  );
  return original;
}

export async function prepareTrainingPlanPrerequisites(actor: AuthenticatedE2EActor) {
  const database = new LocalE2EDatabase();
  const activityPlanId = actorActivityPlanId(actor);
  let originalActivityPlan: Awaited<ReturnType<typeof normalizeSeededActivityPlanHash>> | undefined;
  let planningTimezone: string | null | undefined;
  let athleteState: typeof profileAthleteState.$inferSelect | undefined;
  try {
    originalActivityPlan = await normalizeSeededActivityPlanHash(database, activityPlanId);
    const [[profile], [existingAthleteState]] = await Promise.all([
      database.db
        .select({ planningTimezone: profiles.planning_timezone })
        .from(profiles)
        .where(eq(profiles.id, actor.profileId))
        .limit(1),
      database.db
        .select()
        .from(profileAthleteState)
        .where(eq(profileAthleteState.profile_id, actor.profileId))
        .limit(1),
    ]);
    planningTimezone = profile?.planningTimezone;
    athleteState = existingAthleteState;
    const now = new Date();
    await database.typedTransaction(async (transaction) => {
      await transaction
        .insert(profileAthleteState)
        .values({
          profile_id: actor.profileId,
          source_revision: 1,
          published_revision: 1,
          fitness: 0,
          fatigue: 0,
          evidence_confidence: 0,
          computed_at: now,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: profileAthleteState.profile_id,
          set: {
            source_revision: 1,
            published_revision: 1,
            dirty_from_at: null,
            fitness: 0,
            fatigue: 0,
            evidence_confidence: 0,
            computed_at: now,
            updated_at: now,
          },
        });
      await transaction
        .update(profiles)
        .set({ planning_timezone: "UTC" })
        .where(eq(profiles.id, actor.profileId));
    });
  } catch (error) {
    await database.close();
    throw error;
  }
  return async () => {
    try {
      await database.typedTransaction(async (transaction) => {
        if (originalActivityPlan)
          await transaction
            .update(activityPlans)
            .set({
              structure_hash: originalActivityPlan.structureHash,
              content_visibility: originalActivityPlan.contentVisibility,
            })
            .where(eq(activityPlans.id, activityPlanId));
        if (planningTimezone !== undefined)
          await transaction
            .update(profiles)
            .set({ planning_timezone: planningTimezone })
            .where(eq(profiles.id, actor.profileId));
        await transaction
          .delete(profileAthleteState)
          .where(eq(profileAthleteState.profile_id, actor.profileId));
        if (athleteState) await transaction.insert(profileAthleteState).values(athleteState);
      });
    } finally {
      await database.close();
    }
  };
}

export async function withTrainingPlanLibraryFixture(
  testInfo: TestInfo,
  actor: AuthenticatedE2EActor,
  run: (fixture: TrainingPlanFixture) => Promise<void>,
) {
  const identity = createE2EExecutionIdentity(testInfo);
  const names = fixtureNames(testInfo);
  const database = new LocalE2EDatabase();
  const activityPlanId = actorActivityPlanId(actor);
  let originalActivityPlan: Awaited<ReturnType<typeof normalizeSeededActivityPlanHash>> | undefined;
  let planningTimezone: string | null | undefined;
  try {
    const [profile] = await database.db
      .select({ planningTimezone: profiles.planning_timezone })
      .from(profiles)
      .where(eq(profiles.id, actor.profileId))
      .limit(1);
    planningTimezone = profile?.planningTimezone;
    originalActivityPlan = await normalizeSeededActivityPlanHash(database, activityPlanId);
    const structureBase = {
      version: 1,
      plan_preferences: {
        weekly_session_count: 3,
        target_weekly_duration_minutes: 180,
        maximum_session_duration_minutes: 90,
        preferred_weekdays: [1, 3, 6],
        rest_days: [0],
        progression_style: "balanced",
        recovery_priority: "balanced",
      },
      sessions: [
        {
          id: identity.uuid("training-plan-session"),
          activity_plan_id: activityPlanId,
          offset_days: 0,
          demand: {
            activity_category: "bike",
            training_intent: "general_maintenance",
            target_duration_minutes: null,
            target_common_load: null,
            importance: "normal",
          },
          event_overrides: { title: "Playwright tempo" },
        },
      ],
    };
    const ownedId = identity.uuid("training-plan-owned");
    const templateId = identity.uuid("training-plan-template");
    const ownedStructure = {
      id: ownedId,
      ...canonicalTrainingPlanStructureSchema.parse(structureBase),
    };
    const templateStructure = {
      id: templateId,
      ...canonicalTrainingPlanStructureSchema.parse({
        ...structureBase,
        sessions: structureBase.sessions.map((session) => ({
          ...session,
          id: identity.uuid("training-plan-template-session"),
        })),
      }),
    };
    const inserted = await database.typedTransaction(async (transaction) => {
      await transaction
        .update(profiles)
        .set({ planning_timezone: "UTC" })
        .where(eq(profiles.id, actor.profileId));
      return transaction
        .insert(trainingPlans)
        .values([
          {
            id: ownedId,
            profile_id: actor.profileId,
            name: names.ownedName,
            description: "Owned browser-library fixture",
            structure: ownedStructure,
            structure_hash: structureHash(ownedStructure),
            content_visibility: "private",
            is_system_template: false,
            system_content_key: null,
            system_content_version: null,
            system_content_hash: null,
          },
          {
            id: templateId,
            profile_id: null,
            name: names.templateName,
            description: "System browser-library fixture",
            structure: templateStructure,
            structure_hash: structureHash(templateStructure),
            content_visibility: "public",
            is_system_template: true,
            system_content_key: `e2e:${names.templateName}`,
            system_content_version: 1,
            system_content_hash: structureHash(templateStructure),
          },
        ])
        .returning({
          id: trainingPlans.id,
          isSystemTemplate: trainingPlans.is_system_template,
          profileId: trainingPlans.profile_id,
        });
    });
    const registry = currentE2ECleanupRegistry();
    for (const plan of inserted)
      registerTrainingPlanCleanup(registry, {
        id: plan.id,
        ownerProfileId: plan.profileId,
        scheduledByProfileId: actor.profileId,
        systemTemplate: plan.isSystemTemplate,
      });
    if (!originalActivityPlan) throw new Error("The scheduled activity-plan fixture is absent.");
    await run({ ...names, ownedId, scheduledActivityPlanName: originalActivityPlan.name });
  } finally {
    try {
      await database.typedTransaction(async (transaction) => {
        if (originalActivityPlan)
          await transaction
            .update(activityPlans)
            .set({
              structure_hash: originalActivityPlan.structureHash,
              content_visibility: originalActivityPlan.contentVisibility,
            })
            .where(eq(activityPlans.id, activityPlanId));
        if (planningTimezone !== undefined)
          await transaction
            .update(profiles)
            .set({ planning_timezone: planningTimezone })
            .where(eq(profiles.id, actor.profileId));
      });
    } finally {
      await database.close();
    }
  }
}

export async function expectPlanOwnedPreferences(planId: string) {
  const database = new LocalE2EDatabase();
  try {
    const [plan] = await database.db
      .select({ structure: trainingPlans.structure })
      .from(trainingPlans)
      .where(eq(trainingPlans.id, planId))
      .limit(1);
    const structure = persistedTrainingPlanStructureSchema.parse(plan?.structure);
    if (
      structure.plan_preferences.weekly_session_count !== 3 ||
      structure.plan_preferences.target_weekly_duration_minutes !== 180 ||
      structure.plan_preferences.maximum_session_duration_minutes !== 90
    )
      throw new Error("The seeded training plan did not retain its plan-owned preferences.");
  } finally {
    await database.close();
  }
}
