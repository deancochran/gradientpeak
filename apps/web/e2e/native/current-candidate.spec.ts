import { writeFileSync } from "node:fs";
import { formatDateOnlyInTimeZone } from "@repo/core";
import { activities, plannedSessions, thresholdEvidence } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { completeManualNativeAcceptance } from "./current-candidate-support";

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
  if (record.contractVersion === "plan-tab-projection-v2" && Array.isArray(record.ledgerItems))
    return record as Projection;
  for (const child of Object.values(record)) {
    const found = projectionFrom(child);
    if (found) return found;
  }
  return undefined;
}

test("current Android candidate onboards and creates an executable activity plan through native UI", async ({
  onboardingActor: actor,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(600_000);
  const { completedSession, manualSession, planName, planningTimezone, runAdb, runMaestro, today } =
    await completeManualNativeAcceptance({ actor, e2eDatabase, e2eIdentity, testInfo });
  const recordResult = runMaestro("record-run-native.yaml");
  writeFileSync(
    testInfo.outputPath("maestro-record.log"),
    `${recordResult.stdout ?? ""}\n${recordResult.stderr ?? ""}`,
    { mode: 0o600 },
  );
  expect(recordResult.status, "Native recording must finalize a real local artifact").toBe(0);

  // Disconnect only the runner-owned API reverse. Metro remains reachable so the
  // finalized native artifact and retry UI exercise the app's real recovery path.
  const removeReverse = runAdb("reverse", "--remove", "tcp:3100");
  expect(removeReverse.status, "Must remove the runner-owned API reverse").toBe(0);
  let restoreReverse: ReturnType<typeof runAdb> | undefined;
  try {
    const offlineSaveResult = runMaestro("save-recording-offline.yaml");
    writeFileSync(
      testInfo.outputPath("maestro-record-offline.log"),
      `${offlineSaveResult.stdout ?? ""}\n${offlineSaveResult.stderr ?? ""}`,
      { mode: 0o600 },
    );
    expect(
      offlineSaveResult.status,
      "Offline save must retain the finalized artifact for retry",
    ).toBe(0);
  } finally {
    restoreReverse = runAdb("reverse", "tcp:3100", "tcp:3100");
  }
  expect(restoreReverse.status, "Must restore the runner-owned API reverse").toBe(0);

  const retrySaveResult = runMaestro("retry-recording-save.yaml");
  writeFileSync(
    testInfo.outputPath("maestro-record-retry.log"),
    `${retrySaveResult.stdout ?? ""}\n${retrySaveResult.stderr ?? ""}`,
    { mode: 0o600 },
  );
  expect(
    retrySaveResult.status,
    "The retained artifact must save after one explicit UI retry",
  ).toBe(0);
  const activitiesAfterRecording = await e2eDatabase.db
    .select({
      elapsed_ms: activities.elapsed_ms,
      entry_provenance: activities.entry_provenance,
      finished_at: activities.finished_at,
      id: activities.id,
      name: activities.name,
      started_at: activities.started_at,
    })
    .from(activities)
    .where(eq(activities.profile_id, actor.profileId));
  expect(activitiesAfterRecording).toHaveLength(2);
  const recordedActivity = activitiesAfterRecording.find(
    (activity) => activity.id !== completedSession?.completed_activity_id,
  );
  expect(recordedActivity).toMatchObject({
    id: expect.any(String),
    entry_provenance: null,
    elapsed_ms: expect.any(Number),
    started_at: expect.any(Date),
    finished_at: expect.any(Date),
  });
  expect(recordedActivity?.elapsed_ms).toBeGreaterThan(0);
  if (!recordedActivity?.started_at)
    throw new Error("Native retry did not persist a recorded activity with a start time");
  if (!recordedActivity.name)
    throw new Error(
      "Native retry did not persist a recorded activity name for visible association",
    );

  const associationResult = runMaestro("associate-recorded-native-session.yaml", {
    MAESTRO_ACCEPTANCE_PLAN_NAME: planName,
    MAESTRO_ACCEPTANCE_RECORDED_ACTIVITY_NAME: recordedActivity.name,
    MAESTRO_ACCEPTANCE_SESSION_DATE: today,
    MAESTRO_ACCEPTANCE_SESSION_DAY: String(Number(today.slice(8, 10))),
  });
  writeFileSync(
    testInfo.outputPath("maestro-record-association.log"),
    `${associationResult.stdout ?? ""}\n${associationResult.stderr ?? ""}`,
    { mode: 0o600 },
  );
  expect(
    associationResult.status,
    "Native association must replace the manual completion and reopen its saved activity summary",
  ).toBe(0);
  const [associatedSession] = await e2eDatabase.db
    .select()
    .from(plannedSessions)
    .where(eq(plannedSessions.id, manualSession.id));
  expect(associatedSession).toMatchObject({
    completed_activity_id: recordedActivity.id,
    status: "completed",
  });
  const [supersededManual] = await e2eDatabase.db
    .select({ superseded_by_activity_id: activities.superseded_by_activity_id })
    .from(activities)
    .where(eq(activities.id, completedSession?.completed_activity_id ?? ""));
  expect(supersededManual).toEqual({ superseded_by_activity_id: recordedActivity.id });
  expect(
    await e2eDatabase.db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.profile_id, actor.profileId)),
  ).toHaveLength(2);
  const web = await actor.createPage(`/activities/${recordedActivity.id}`);
  await expect(web.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
  await web.goto("/activities");
  await expect(web.locator(`a[href="/activities/${recordedActivity.id}"]`)).toHaveCount(1);
  await expect(
    web.locator(`a[href="/activities/${completedSession?.completed_activity_id}"]`),
  ).toHaveCount(0);
  await web.goto(`/calendar/day/${today}`);
  await expect(
    web
      .getByRole("link", { name: /^Open activity / })
      .and(web.locator(`a[href="/activities/${recordedActivity.id}"]`)),
  ).toHaveCount(1);
  await expect(
    web.locator(`a[href="/activities/${completedSession?.completed_activity_id}"]`),
  ).toHaveCount(0);
  const projectionResponse = web.waitForResponse((response) =>
    response.url().includes("trainingPlans.getPlanTabProjection"),
  );
  await web.goto("/plan");
  const projection = projectionFrom(await (await projectionResponse).json());
  if (!projection) throw new Error("Web training summary response was unavailable");
  expect(projection.planningTimezone).toBe(planningTimezone);
  expect(projection.today).toBe(today);
  const completed = projection.ledgerItems.filter((item) => item.kind === "completed");
  expect(completed.map((item) => item.id)).toEqual([recordedActivity.id]);
  for (const item of completed)
    expect(item).toMatchObject({
      date: formatDateOnlyInTimeZone(recordedActivity.started_at, planningTimezone),
      load: null,
      loadStatus: "unavailable",
    });
  expect(projection.dayLoads[today]).toMatchObject({
    completedLoad: null,
    completedLoadStatus: "unavailable",
  });
  await expect(web.getByRole("heading", { level: 2, name: /training path/i })).toBeVisible();
  await web.close();
  // Always cross a month boundary: the native picker must navigate from the
  // next month's session date back to the final day of this planning month,
  // rather than accidentally matching a same-number day in its initial month.
  const nextMonthStart = new Date(Date.parse(`${today.slice(0, 7)}-01T12:00:00Z`));
  nextMonthStart.setUTCMonth(nextMonthStart.getUTCMonth() + 1);
  const laterDate = nextMonthStart.toISOString().slice(0, 10);
  const rescheduledDate = new Date(nextMonthStart.getTime() - 86400000).toISOString().slice(0, 10);
  const laterResult = runMaestro("schedule-native-plan.yaml", {
    MAESTRO_ACCEPTANCE_PLAN_NAME: planName,
    MAESTRO_ACCEPTANCE_SCHEDULE_DAY: String(Number(laterDate.slice(8, 10))),
    MAESTRO_ACCEPTANCE_SCHEDULE_MONTH_DELTA: "1",
    MAESTRO_ACCEPTANCE_SCHEDULE_FROM_LIBRARY: "true",
  });
  writeFileSync(
    testInfo.outputPath("maestro-schedule-later.log"),
    `${laterResult.stdout ?? ""}\n${laterResult.stderr ?? ""}`,
    { mode: 0o600 },
  );
  expect(laterResult.status, "Native second schedule must succeed").toBe(0);
  const sessions = await e2eDatabase.db
    .select()
    .from(plannedSessions)
    .where(eq(plannedSessions.profile_id, actor.profileId));
  expect(sessions).toHaveLength(2);
  const laterSession = sessions.find((session) => session.id !== manualSession.id);
  expect(laterSession).toMatchObject({ planning_date: laterDate, status: "scheduled" });
  if (!laterSession) throw new Error("Later native session missing");
  const rescheduleDay = rescheduledDate.split("-")[2];
  const rescheduleResult = runMaestro("reschedule-native-session.yaml", {
    MAESTRO_ACCEPTANCE_PLAN_NAME: planName,
    MAESTRO_ACCEPTANCE_RESCHEDULE_DATE: rescheduledDate,
    MAESTRO_ACCEPTANCE_RESCHEDULE_DAY: String(Number(rescheduleDay)),
    MAESTRO_ACCEPTANCE_RESCHEDULE_MONTH_DELTA: String(
      (Number(rescheduledDate.slice(0, 4)) - Number(laterDate.slice(0, 4))) * 12 +
        Number(rescheduledDate.slice(5, 7)) -
        Number(laterDate.slice(5, 7)),
    ),
    MAESTRO_ACCEPTANCE_SESSION_DATE: laterDate,
    MAESTRO_ACCEPTANCE_SESSION_DAY: String(Number(laterDate.slice(8, 10))),
    MAESTRO_ACCEPTANCE_SESSION_MONTH_DELTA: "1",
  });
  writeFileSync(
    testInfo.outputPath("maestro-reschedule.log"),
    `${rescheduleResult.stdout ?? ""}\n${rescheduleResult.stderr ?? ""}`,
    { mode: 0o600 },
  );
  expect(rescheduleResult.status, "Native rescheduling must succeed").toBe(0);
  const [rescheduled] = await e2eDatabase.db
    .select()
    .from(plannedSessions)
    .where(eq(plannedSessions.id, laterSession.id));
  expect(rescheduled).toMatchObject({
    planning_date: rescheduledDate,
    session_revision: laterSession.session_revision + 1,
    status: "scheduled",
  });
  const cancelResult = runMaestro("cancel-native-session.yaml");
  writeFileSync(
    testInfo.outputPath("maestro-cancel.log"),
    `${cancelResult.stdout ?? ""}\n${cancelResult.stderr ?? ""}`,
    { mode: 0o600 },
  );
  expect(cancelResult.status, "Native cancellation must succeed").toBe(0);
  const [cancelled] = await e2eDatabase.db
    .select()
    .from(plannedSessions)
    .where(eq(plannedSessions.id, laterSession.id));
  expect(cancelled).toMatchObject({ status: "cancelled", cancellation_reason: "user_requested" });
  expect(
    await e2eDatabase.db
      .select({ id: thresholdEvidence.id })
      .from(thresholdEvidence)
      .where(eq(thresholdEvidence.profile_id, actor.profileId)),
  ).toEqual([]);
});
