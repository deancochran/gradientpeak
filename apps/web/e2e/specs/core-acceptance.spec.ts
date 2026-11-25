import { formatDateOnlyInTimeZone } from "@repo/core";
import {
  activities,
  activityPlans,
  activitySessionRpeEvidence,
  manualTrainingDiaryOperations,
  plannedSessions,
  profiles,
  thresholdEvidence,
} from "@repo/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { activityFiles, importActivity } from "../activities/fixture-files";
import { expect, test } from "../fixtures";
import { ActivityPlansPage, AuthPage, RecordingPage, withTrpcFailure } from "../pages";
import {
  recordingSubmissionActivityId,
  recordingSubmissionJobCount,
  waitForActiveRecordingDraft,
} from "../recording/indexed-db";

type Projection = {
  contractVersion: "plan-tab-projection-v2";
  planningTimezone: string | null;
  today: string | null;
  ledgerItems: Array<{
    id: string;
    date: string;
    kind: string;
    load: number | null;
    loadStatus: string;
  }>;
  dayLoads: Record<string, { completedLoad: number | null; completedLoadStatus: string }>;
};

function projectionFrom(value: unknown): Projection | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record.contractVersion === "plan-tab-projection-v2" && Array.isArray(record.ledgerItems)) {
    return record as Projection;
  }
  for (const child of Object.values(record)) {
    const found = projectionFrom(child);
    if (found) return found;
  }
  return undefined;
}

test("new athlete uses settings and plan composer before recording, replacing, and reopening consistent views", async ({
  onboardingActor: actor,
  onboardingPage: page,
  e2eData,
  e2eDatabase,
  e2eIdentity,
}) => {
  test.setTimeout(150_000);
  const sessionIds: string[] = [];
  const activityIds: string[] = [];
  await page.route(/(?:googleapis|mapbox|openstreetmap|tiles|maps)\./i, (route) => route.abort());
  expect(
    await e2eDatabase.db
      .select({ id: thresholdEvidence.id })
      .from(thresholdEvidence)
      .where(eq(thresholdEvidence.profile_id, actor.profileId)),
  ).toEqual([]);
  expect(
    await e2eDatabase.db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.profile_id, actor.profileId)),
  ).toEqual([]);
  await new AuthPage(page).completeProfile({
    fullName: "Core acceptance athlete",
    username: `core_${e2eIdentity.suffix("athlete", 16)}`,
  });
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/settings");
  await page.getByLabel("Planning Timezone").click();
  await page.getByLabel("Search timezones").fill("UTC");
  await page.getByRole("option", { name: "UTC", exact: true }).click();
  await page.getByRole("button", { name: "Update Profile" }).click();
  await expect(
    page.getByText("Profile updated successfully", { exact: true }).last(),
  ).toBeVisible();
  const persistedTimezone = async () => {
    const [profile] = await e2eDatabase.db
      .select({ planningTimezone: profiles.planning_timezone })
      .from(profiles)
      .where(eq(profiles.id, actor.profileId));
    return profile?.planningTimezone ?? null;
  };
  await expect.poll(persistedTimezone).toBe("UTC");
  const [profile] = await e2eDatabase.db
    .select({ planningTimezone: profiles.planning_timezone })
    .from(profiles)
    .where(eq(profiles.id, actor.profileId));
  if (!profile?.planningTimezone)
    throw new Error("Settings UI did not persist the planning timezone");
  const planningTimezone = profile.planningTimezone;
  const today = formatDateOnlyInTimeZone(new Date(), planningTimezone);
  const date = (days: number) =>
    new Date(Date.parse(`${today}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const plansPage = new ActivityPlansPage(page);
  const createPlan = async (label: string) => {
    const name = e2eIdentity.name(`Easy ${label} session`);
    await plansPage.openLibrary();
    await plansPage.startCreate();
    await page.getByLabel("Plan name").fill(name);
    await page.getByLabel("Activity category").selectOption("run");
    await page.getByRole("button", { name: "Add step", exact: true }).click();
    const step = page.getByTestId("activity-plan-item-0");
    await step.getByLabel("Completion").selectOption("time");
    await step.getByLabel("Quantity").fill("600");
    await step.getByRole("button", { name: "Add target", exact: true }).click();
    await step.getByLabel("Target type 1").selectOption("RPE");
    await step.getByLabel("Target intensity 1").fill("3");
    await page.getByRole("button", { name: "Create plan", exact: true }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    const created = await e2eDatabase.db
      .select({
        id: activityPlans.id,
        name: activityPlans.name,
        structure: activityPlans.structure,
      })
      .from(activityPlans)
      .where(and(eq(activityPlans.profile_id, actor.profileId), eq(activityPlans.name, name)));
    expect(created).toHaveLength(1);
    const [plan] = created;
    if (!plan) throw new Error("UI-created plan lookup returned no plan");
    expect(plan.structure).toMatchObject({
      version: 5,
      activity_category: "run",
      items: [
        {
          type: "step",
          duration: { type: "time", seconds: 600 },
          targets: [{ type: "RPE", intensity: 3 }],
        },
      ],
    });
    return { id: plan.id, name: plan.name, url: `/activity-plans/${plan.id}` };
  };
  const plans = [];
  for (const label of ["record", "manual", "upcoming"]) plans.push(await createPlan(label));
  const [recordPlan, manualPlan, upcomingPlan] = plans;
  if (!recordPlan || !manualPlan || !upcomingPlan)
    throw new Error("UI-created acceptance plans missing");
  const openSession = async (id: string) => {
    await page.goto(
      `/calendar/events/${id}?resourceType=planned_session&month=${today.slice(0, 7)}&view=agenda`,
    );
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  };
  const readSession = async (id: string) => {
    const [row] = await e2eDatabase.db
      .select()
      .from(plannedSessions)
      .where(and(eq(plannedSessions.id, id), eq(plannedSessions.profile_id, actor.profileId)));
    if (!row) throw new Error("Owned planned session is missing");
    return row;
  };
  try {
    for (const [index, plan] of plans.entries()) {
      await page.goto(plan.url);
      await page.getByLabel("Schedule date").fill(index === 2 ? date(1) : today);
      await page.getByRole("button", { name: "Schedule", exact: true }).click();
      await expect(page.getByText("Activity plan scheduled", { exact: true })).toBeVisible();
      const [row] = await e2eDatabase.db
        .select({ id: plannedSessions.id })
        .from(plannedSessions)
        .where(
          and(
            eq(plannedSessions.profile_id, actor.profileId),
            eq(plannedSessions.activity_plan_id, plan.id),
          ),
        );
      if (!row) throw new Error("UI scheduling did not persist a session");
      sessionIds.push(row.id);
    }
    const [recordSession, manualSession, upcomingSession] = sessionIds;
    if (!recordSession || !manualSession || !upcomingSession)
      throw new Error("Acceptance sessions missing");
    await openSession(upcomingSession);
    await expect(page.getByRole("heading", { name: upcomingPlan.name })).toBeVisible();
    await page.goto(upcomingPlan.url);
    await page.getByLabel("Schedule date").fill(date(2));
    await page.getByRole("button", { name: "Reschedule", exact: true }).click();
    await expect.poll(async () => (await readSession(upcomingSession)).planning_date).toBe(date(2));
    await page.reload();
    await expect(page.getByLabel("Schedule date")).toHaveValue(date(2));
    await page.getByRole("button", { name: "Remove from schedule", exact: true }).click();
    await expect.poll(async () => (await readSession(upcomingSession)).status).toBe("cancelled");
    await page.reload();
    await expect(page.getByRole("button", { name: "Schedule", exact: true })).toBeVisible();

    await openSession(recordSession);
    await page.getByRole("link", { name: "Record activity", exact: true }).click();
    const recorder = new RecordingPage(page);
    await page.clock.install({ time: new Date(`${today}T08:00:00Z`) });
    await recorder.startSession();
    await waitForActiveRecordingDraft(page);
    await page.clock.fastForward(600_000);
    await recorder.finish();
    await page.getByLabel("Perceived effort (1–10)").fill("3");
    await page.context().setOffline(true);
    await recorder.save();
    await expect(page.getByText(/submission: waiting to retry/i)).toBeVisible();
    await recorder.save();
    expect(await recordingSubmissionJobCount(page)).toBe(1);
    await page.context().setOffline(false);
    await page.getByRole("button", { name: /retry now/i }).click();
    await expect(page.getByRole("link", { name: "Open saved activity", exact: true })).toBeVisible({
      timeout: 20_000,
    });
    const recordedId = await recordingSubmissionActivityId(page);
    if (!recordedId) throw new Error("Recording did not persist an activity");
    activityIds.push(recordedId);
    e2eData.activities.register(recordedId, actor.profileId);
    expect((await readSession(recordSession)).completed_activity_id).toBe(recordedId);
    await page.clock.setSystemTime(new Date());

    await openSession(manualSession);
    await page.getByRole("button", { name: "Actual details (optional)" }).click();
    await page.getByLabel("Actual duration (minutes, optional)").fill("20");
    await page.getByLabel("RPE (1-10, optional)").fill("5");
    await withTrpcFailure(
      page,
      "activities.createManualDiaryEntry",
      async (interception) => {
        await page.getByRole("button", { name: "Complete activity", exact: true }).click();
        await expect(
          page.getByRole("button", { name: "Retry saved request", exact: true }),
        ).toBeVisible();
        await expect(page.getByLabel("Actual duration (minutes, optional)")).toHaveValue("20");
        expect(interception.calls()).toBe(1);
      },
      { afterRequest: true, times: 1 },
    );
    const retryResponse = page.waitForResponse(
      (response) =>
        response.url().includes("activities.createManualDiaryEntry") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Retry saved request", exact: true }).click();
    expect((await retryResponse).ok()).toBe(true);
    await expect(page.getByRole("link", { name: "View linked completed activity" })).toBeVisible();
    const manualId = (await readSession(manualSession)).completed_activity_id;
    if (!manualId) throw new Error("Manual completion did not persist");
    e2eData.activities.register(manualId, actor.profileId);
    expect(
      await e2eDatabase.db
        .select({ id: activities.id })
        .from(activities)
        .where(
          and(
            eq(activities.profile_id, actor.profileId),
            eq(activities.entry_provenance, "manual"),
          ),
        ),
    ).toHaveLength(1);

    const importedId = await importActivity(
      page,
      {
        ...activityFiles.gpx,
        buffer: Buffer.from(activityFiles.gpx.buffer.toString().replaceAll("2026-01-01", today)),
      },
      e2eIdentity.name("later recorded replacement"),
    );
    activityIds.push(importedId);
    e2eData.activities.register(importedId, actor.profileId);
    await page.getByLabel("Perceived exertion").fill("5");
    await page.getByRole("button", { name: "Save RPE", exact: true }).click();
    await expect(page.getByText("Session RPE saved.", { exact: true })).toBeVisible();
    expect(
      await e2eDatabase.db
        .select({ rpe: activitySessionRpeEvidence.rpe })
        .from(activitySessionRpeEvidence)
        .where(
          and(
            eq(activitySessionRpeEvidence.activity_id, importedId),
            eq(activitySessionRpeEvidence.profile_id, actor.profileId),
          ),
        ),
    ).toEqual([{ rpe: 5 }]);
    expect(
      await e2eDatabase.db
        .select({ id: thresholdEvidence.id })
        .from(thresholdEvidence)
        .where(eq(thresholdEvidence.profile_id, actor.profileId)),
    ).toEqual([]);
    await openSession(manualSession);
    await page.getByRole("button", { name: "Associate recorded activity", exact: true }).click();
    await page.locator(`#completion-candidate-${importedId}`).click();
    await page.getByRole("button", { name: "Confirm association", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "View linked completed activity" }),
    ).toHaveAttribute("href", `/activities/${importedId}`);
    const [manual] = await e2eDatabase.db
      .select({ replacement: activities.superseded_by_activity_id })
      .from(activities)
      .where(eq(activities.id, manualId));
    expect(manual?.replacement).toBe(importedId);

    await page.reload();
    await expect(
      page.getByRole("link", { name: "View linked completed activity" }),
    ).toHaveAttribute("href", `/activities/${importedId}`);
    await page.goto(`/calendar/day/${today}`);
    await page.reload();
    for (const id of activityIds)
      await expect(
        page
          .getByRole("link", { name: /^Open activity / })
          .and(page.locator(`a[href="/activities/${id}"]`)),
      ).toHaveCount(1);
    await expect(page.locator(`a[href="/activities/${manualId}"]`)).toHaveCount(0);
    for (const id of activityIds) {
      await page.goto(`/activities/${id}`);
      await page.reload();
      await expect(page.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
    }
    for (let reopen = 0; reopen < 2; reopen++) {
      const response = page.waitForResponse((result) =>
        result.url().includes("trainingPlans.getPlanTabProjection"),
      );
      if (reopen === 0) await page.goto("/plan");
      else await page.reload();
      const projection = projectionFrom(await (await response).json());
      if (!projection) throw new Error("Training summary response was unavailable");
      expect(projection.planningTimezone).toBe(planningTimezone);
      expect(projection.today).toBe(today);
      const completed = projection.ledgerItems.filter((item) => item.kind === "completed");
      expect(completed.map((item) => item.id).sort()).toEqual([...activityIds].sort());
      const expectedCompletedDates = new Map(
        (
          await e2eDatabase.db
            .select({ id: activities.id, startedAt: activities.started_at })
            .from(activities)
            .where(
              and(eq(activities.profile_id, actor.profileId), inArray(activities.id, activityIds)),
            )
        ).map((activity) => {
          if (!activity.startedAt)
            throw new Error(`Completed activity ${activity.id} has no persisted start time`);
          return [activity.id, formatDateOnlyInTimeZone(activity.startedAt, planningTimezone)];
        }),
      );
      // Session RPE is separate evidence, not a substitute for the thresholds
      // needed by Common Load. This no-metric athlete must retain unknown load,
      // rather than display a fabricated numeric total or count the manual row.
      for (const item of completed) {
        expect(item).toMatchObject({
          date: expectedCompletedDates.get(item.id),
          load: null,
          loadStatus: "unavailable",
        });
      }
      expect(projection.dayLoads[today]).toMatchObject({
        completedLoad: null,
        completedLoadStatus: "unavailable",
      });
      await expect(page.getByRole("heading", { level: 2, name: /training path/i })).toBeVisible();
    }
  } finally {
    await page.context().setOffline(false);
    await e2eDatabase.db
      .delete(manualTrainingDiaryOperations)
      .where(eq(manualTrainingDiaryOperations.profile_id, actor.profileId));
    if (sessionIds.length)
      await e2eDatabase.db
        .delete(activities)
        .where(
          and(
            eq(activities.profile_id, actor.profileId),
            inArray(activities.reconciled_planned_session_id, sessionIds),
          ),
        );
    if (sessionIds.length)
      await e2eDatabase.db
        .delete(plannedSessions)
        .where(
          and(
            eq(plannedSessions.profile_id, actor.profileId),
            inArray(plannedSessions.id, sessionIds),
          ),
        );
  }
});
