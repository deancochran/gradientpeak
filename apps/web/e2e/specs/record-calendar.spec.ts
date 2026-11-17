import { activityPlanStructureSchema } from "@repo/core/activity-plan";
import { activities, activityPlans, plannedSessions } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { RecordingPage, SettingsPage } from "../pages";
import {
  recordingSubmissionActivityId,
  recordingSubmittedSnapshot,
  waitForActiveRecordingDraft,
} from "../recording/indexed-db";

test.setTimeout(60000);
const plannedStructure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "bike",
  items: [
    {
      type: "step",
      id: "e3000000-0000-4000-8000-000000000101",
      name: "First effort",
      duration: { type: "time", seconds: 5 },
      targets: [{ type: "%FTP", intensity: 70 }],
    },
    {
      type: "step",
      id: "e3000000-0000-4000-8000-000000000102",
      name: "Second effort",
      duration: { type: "time", seconds: 5 },
      targets: [{ type: "%FTP", intensity: 75 }],
    },
  ],
});
const plannedStep = plannedStructure.items[0];
if (!plannedStep) throw new Error("Calendar recording fixture is incomplete.");
const changedLiveStructure = activityPlanStructureSchema.parse({
  ...plannedStructure,
  items: [
    ...plannedStructure.items,
    {
      type: "step",
      id: "e3000000-0000-4000-8000-000000000103",
      name: "Live-only extra effort",
      duration: { type: "time", seconds: 5 },
      targets: [{ type: "%FTP", intensity: 80 }],
    },
  ],
});
async function scheduleAndLaunch(input: {
  page: import("@playwright/test").Page;
  plan: {
    id: string;
    name: string;
    url: string;
  };
  planningDate: string;
}) {
  await input.page.goto(input.plan.url);
  await input.page.getByLabel("Schedule date").fill(input.planningDate);
  await input.page.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(input.page.getByText("Activity plan scheduled")).toBeVisible();
  await input.page.goto(`/calendar/day/${input.planningDate}`);
  const open = input.page.getByRole("link", { name: /^Open planned activity / });
  await expect(open).toBeVisible();
  await open.click();
  const recordLink = input.page.getByRole("link", { name: "Record activity", exact: true });
  await expect(recordLink).toBeVisible();
  const href = await recordLink.getAttribute("href");
  const sessionId = href
    ? new URL(href, input.page.url()).searchParams.get("plannedSessionId")
    : null;
  if (!sessionId) throw new Error("Scheduled calendar session did not expose its identity.");
  await recordLink.click();
  await expect(input.page).toHaveURL(new RegExp(`plannedSessionId=${sessionId}`));
  return sessionId;
}
/**
 * Deliberately bypasses the plan-edit UI to inject a concurrent live-plan mutation
 * after the recorder has started. This is fault injection, not an edit-UX claim:
 * the assertion below proves that start-time execution evidence remains immutable.
 */
async function injectConcurrentLivePlanMutation(input: {
  actor: {
    request: import("@playwright/test").APIRequestContext;
  };
  database: import("../support/database").LocalE2EDatabase;
  planId: string;
}) {
  const [plan] = await input.database.db
    .select({ revision: activityPlans.revision, structureHash: activityPlans.structure_hash })
    .from(activityPlans)
    .where(eq(activityPlans.id, input.planId));
  if (!plan) throw new Error("Owned activity plan was not found for the live-content update.");
  const response = await input.actor.request.post("/api/trpc/activityPlans.update?batch=1", {
    data: {
      0: {
        json: {
          id: input.planId,
          expectedRevision: plan.revision,
          expectedStructureHash: plan.structureHash,
          structure: changedLiveStructure,
        },
      },
    },
  });
  if (!response.ok())
    throw new Error(`Owned live-plan update failed with HTTP ${response.status()}.`);
}
test.beforeEach(async ({ athletePage }) => {
  await athletePage.route(/(?:googleapis|mapbox|openstreetmap|tiles|maps)\./i, (route) =>
    route.abort(),
  );
});
test("[P0] calendar recording freezes its planned session, saves a full completion, and exposes the completed link", async ({
  athleteActor,
  athletePage,
  e2eData,
  e2eDatabase,
  e2eIdentity,
}) => {
  const profileId = athleteActor.profileId;
  const planningDate = "2026-01-01";
  const plan = await e2eData.activityPlans.create({
    actorEmail: athleteActor.email,
    label: "calendar-record-full",
    name: e2eIdentity.name("Calendar full plan"),
    structure: plannedStructure,
  });
  await new SettingsPage(athletePage).setPlanningTimezone("UTC");
  const sessionId = await scheduleAndLaunch({ page: athletePage, plan, planningDate });
  const recording = new RecordingPage(athletePage);
  let activityId: string | null = null;
  try {
    await athletePage.clock.install({ time: new Date(`${planningDate}T12:00:00.000Z`) });
    await recording.startSession();
    await athletePage.clock.fastForward(10000);
    await recording.pause();
    await expect(athletePage.getByText(/^paused$/i)).toBeVisible();
    await athletePage.reload();
    await expect(athletePage.getByText(/recovered safely in paused state/i)).toBeVisible();
    await injectConcurrentLivePlanMutation({
      actor: athleteActor,
      database: e2eDatabase,
      planId: plan.id,
    });
    await recording.resume();
    await recording.finish();
    await recording.save();
    const open = athletePage.getByRole("link", { name: "Open saved activity", exact: true });
    await expect(open).toBeVisible({ timeout: 20000 });
    activityId = await recordingSubmissionActivityId(athletePage);
    if (!activityId)
      throw new Error("Saved calendar recording did not expose its activity identity.");
    e2eData.activities.register(activityId, profileId);
    expect(
      await e2eDatabase.db
        .select({
          activityPlanId: activities.activity_plan_id,
          elapsedMs: activities.elapsed_ms,
          outcome: plannedSessions.completion_outcome,
          sessionActivityId: plannedSessions.completed_activity_id,
          status: plannedSessions.status,
          legacyManifest: plannedSessions.resolution_manifest,
        })
        .from(plannedSessions)
        .innerJoin(
          activities,
          and(
            eq(activities.id, plannedSessions.completed_activity_id),
            eq(activities.profile_id, plannedSessions.profile_id),
          ),
        )
        .where(and(eq(plannedSessions.id, sessionId), eq(plannedSessions.profile_id, profileId))),
    ).toMatchObject([
      {
        activityPlanId: plan.id,
        elapsedMs: expect.any(Number),
        outcome: "full",
        sessionActivityId: activityId,
        status: "completed",
        legacyManifest: null,
      },
    ]);
    // Scheduled rows reference current plans; the recorder, not the scheduled
    // row's retired manifest, owns execution evidence captured at start.
    expect(await recordingSubmittedSnapshot(athletePage)).toMatchObject({
      planExecution: { structure: plannedStructure },
    });
    const [currentPlan] = await e2eDatabase.db
      .select({ structure: activityPlans.structure })
      .from(activityPlans)
      .where(eq(activityPlans.id, plan.id));
    expect(currentPlan?.structure).toEqual(changedLiveStructure);
    const [saved] = await e2eDatabase.db
      .select({ elapsedMs: activities.elapsed_ms })
      .from(activities)
      .where(and(eq(activities.id, activityId), eq(activities.profile_id, profileId)));
    expect(saved?.elapsedMs).toBeGreaterThanOrEqual(1);
    await athletePage.goto(`/calendar/day/${planningDate}`);
    const completedActivity = athletePage.getByRole("link", { name: /^Open activity / });
    await expect(completedActivity).toHaveAttribute("href", `/activities/${activityId}`);
    await completedActivity.click();
    await expect(athletePage).toHaveURL(new RegExp(`/activities/${activityId}$`));
  } finally {
    await e2eDatabase.db
      .delete(plannedSessions)
      .where(and(eq(plannedSessions.id, sessionId), eq(plannedSessions.profile_id, profileId)));
    if (activityId) e2eData.activities.register(activityId, profileId);
  }
});
test("[P0] an early finished calendar recording persists a partial completion once despite double save", async ({
  athleteActor,
  athletePage,
  e2eData,
  e2eDatabase,
  e2eIdentity,
}) => {
  const profileId = athleteActor.profileId;
  const planningDate = "2026-01-02";
  const plan = await e2eData.activityPlans.create({
    actorEmail: athleteActor.email,
    label: "calendar-record-partial",
    name: e2eIdentity.name("Calendar partial plan"),
    structure: plannedStructure,
  });
  await new SettingsPage(athletePage).setPlanningTimezone("UTC");
  const sessionId = await scheduleAndLaunch({ page: athletePage, plan, planningDate });
  const recording = new RecordingPage(athletePage);
  let activityId: string | null = null;
  try {
    await athletePage.clock.install({ time: new Date(`${planningDate}T12:00:00.000Z`) });
    await recording.startSession();
    await waitForActiveRecordingDraft(athletePage);
    await athletePage.clock.fastForward(1000);
    await recording.finish();
    await athletePage.getByRole("button", { name: /^save activity$/i }).dblclick();
    await expect(
      athletePage.getByRole("link", { name: "Open saved activity", exact: true }),
    ).toBeVisible({ timeout: 20000 });
    activityId = await recordingSubmissionActivityId(athletePage);
    if (!activityId)
      throw new Error("Saved partial calendar recording did not expose its activity identity.");
    e2eData.activities.register(activityId, profileId);
    expect(
      await e2eDatabase.db
        .select({
          activityId: plannedSessions.completed_activity_id,
          outcome: plannedSessions.completion_outcome,
          status: plannedSessions.status,
        })
        .from(plannedSessions)
        .where(and(eq(plannedSessions.id, sessionId), eq(plannedSessions.profile_id, profileId))),
    ).toEqual([{ activityId, outcome: "partial", status: "completed" }]);
    expect(
      await e2eDatabase.db
        .select({ id: activities.id })
        .from(activities)
        .where(and(eq(activities.activity_plan_id, plan.id), eq(activities.profile_id, profileId))),
    ).toEqual([{ id: activityId }]);
  } finally {
    await e2eDatabase.db
      .delete(plannedSessions)
      .where(and(eq(plannedSessions.id, sessionId), eq(plannedSessions.profile_id, profileId)));
    if (activityId) e2eData.activities.register(activityId, profileId);
  }
});
