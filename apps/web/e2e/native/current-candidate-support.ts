import { spawnSync } from "node:child_process";
import { constants, copyFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type TestInfo } from "@playwright/test";
import { formatDateOnlyInTimeZone } from "@repo/core";
import { activities, activityPlans, plannedSessions, profiles } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { AuthenticatedE2EActor } from "../support/actors";
import type { LocalE2EDatabase } from "../support/database";
import type { E2EExecutionIdentity } from "../support/identity";

type NativeManualAcceptanceInput = {
  actor: AuthenticatedE2EActor;
  e2eDatabase: LocalE2EDatabase;
  e2eIdentity: E2EExecutionIdentity;
  testInfo: TestInfo;
};

function preserveMaestroCaptures(testInfo: TestInfo, captures: readonly string[]) {
  return captures.map((capture) => {
    const source = resolve(`${capture}.png`);
    const retained = existsSync(source);
    if (retained) {
      copyFileSync(source, testInfo.outputPath(`${capture}.png`), constants.COPYFILE_EXCL);
      rmSync(source);
    }
    return retained;
  });
}

function clearMaestroCaptures(captures: readonly string[]) {
  for (const capture of captures) {
    rmSync(resolve(`${capture}.png`), { force: true });
  }
}

export async function completeManualNativeAcceptance({
  actor,
  e2eDatabase,
  e2eIdentity,
  testInfo,
}: NativeManualAcceptanceInput) {
  const username = `native_${e2eIdentity.suffix("username", 12)}`;
  const planName = e2eIdentity.name("Native easy session");
  const runMaestro = (flow: string, extraEnvironment: Record<string, string> = {}) =>
    spawnSync(
      "maestro",
      [
        "--udid",
        "emulator-5554",
        "test",
        "--debug-output",
        testInfo.outputPath("maestro"),
        `../mobile/.maestro/flows/acceptance/${flow}`,
      ],
      {
        encoding: "utf8",
        // Cold startup has its own 90s visibility budget; leave room for the
        // onboarding/home waits and actions without relaxing editor flow bounds.
        timeout: flow === "profile-onboarding.yaml" ? 240_000 : 150_000,
        env: {
          ...process.env,
          MAESTRO_ACCEPTANCE_EMAIL: actor.email,
          MAESTRO_ACCEPTANCE_PASSWORD: actor.password,
          MAESTRO_ACCEPTANCE_USERNAME: username,
          MAESTRO_ACCEPTANCE_PLAN_NAME: planName,
          ...extraEnvironment,
        },
      },
    );
  const runAdb = (...args: string[]) =>
    spawnSync("adb", ["-s", "emulator-5554", ...args], {
      encoding: "utf8",
      timeout: 30_000,
    });
  const result = runMaestro("profile-onboarding.yaml");
  writeFileSync(
    testInfo.outputPath("maestro.log"),
    `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    { mode: 0o600 },
  );
  expect(result.error, "Maestro must execute on the designated emulator").toBeUndefined();
  expect(result.status, "See the private Maestro output for the failing native action").toBe(0);
  const [profile] = await e2eDatabase.db
    .select()
    .from(profiles)
    .where(eq(profiles.id, actor.profileId));
  expect(profile).toMatchObject({
    full_name: "Native acceptance athlete",
    username,
    onboarding_status: "completed",
  });
  if (!profile?.planning_timezone)
    throw new Error("Onboarding must persist a planning timezone before native scheduling");
  const planResult = runMaestro("create-easy-activity-plan.yaml");
  writeFileSync(
    testInfo.outputPath("maestro-create-plan.log"),
    `${planResult.stdout ?? ""}\n${planResult.stderr ?? ""}`,
    { mode: 0o600 },
  );
  expect(planResult.error, "Maestro must execute the native plan composer").toBeUndefined();
  expect(planResult.status, "See private Maestro plan-composer output").toBe(0);
  const plans = await e2eDatabase.db
    .select({ id: activityPlans.id, name: activityPlans.name, structure: activityPlans.structure })
    .from(activityPlans)
    .where(eq(activityPlans.profile_id, actor.profileId));
  expect(plans).toEqual([
    expect.objectContaining({
      id: expect.any(String),
      name: planName,
      structure: expect.objectContaining({
        activity_category: "run",
        items: [
          expect.objectContaining({
            duration: { seconds: 60, type: "time" },
            targets: [{ type: "rest" }],
            type: "step",
          }),
        ],
        version: 5,
      }),
    }),
  ]);
  const [plan] = plans;
  if (!plan) throw new Error("Native UI did not persist the activity plan");
  // Completion availability is evaluated against the athlete's authoritative
  // planning day, which may be different from the runner's UTC date.
  const today = formatDateOnlyInTimeZone(new Date(), profile.planning_timezone);
  const scheduleResult = runMaestro("schedule-native-plan.yaml", {
    MAESTRO_ACCEPTANCE_PLAN_NAME: planName,
    MAESTRO_ACCEPTANCE_SCHEDULE_DAY: String(Number(today.slice(8, 10))),
    MAESTRO_ACCEPTANCE_SCHEDULE_MONTH_DELTA: "0",
    MAESTRO_ACCEPTANCE_SCHEDULE_FROM_LIBRARY: "false",
  });
  writeFileSync(
    testInfo.outputPath("maestro-schedule.log"),
    `${scheduleResult.stdout ?? ""}\n${scheduleResult.stderr ?? ""}`,
    { mode: 0o600 },
  );
  expect(scheduleResult.error, "Maestro must execute native scheduling").toBeUndefined();
  expect(scheduleResult.status, "See private Maestro scheduling output").toBe(0);
  expect(
    await e2eDatabase.db
      .select({
        id: plannedSessions.id,
        planning_date: plannedSessions.planning_date,
        profile_id: plannedSessions.profile_id,
        status: plannedSessions.status,
      })
      .from(plannedSessions)
      .where(eq(plannedSessions.activity_plan_id, plan.id)),
  ).toEqual([
    {
      id: expect.any(String),
      planning_date: today,
      profile_id: actor.profileId,
      status: "scheduled",
    },
  ]);
  expect(
    await e2eDatabase.db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.profile_id, actor.profileId)),
  ).toEqual([]);
  const [manualSession] = await e2eDatabase.db
    .select()
    .from(plannedSessions)
    .where(eq(plannedSessions.profile_id, actor.profileId));
  if (!manualSession) throw new Error("Native UI-created session is missing");
  const workspaceCaptures = ["athlete-workspace-selected-session"] as const;
  clearMaestroCaptures(workspaceCaptures);
  const athleteVisualWorkspaceResult = runMaestro("athlete-visual-workspace.yaml", {
    MAESTRO_ACCEPTANCE_SESSION_DATE: today,
    MAESTRO_ACCEPTANCE_SESSION_ID: manualSession.id,
  });
  const [workspaceCaptured] = preserveMaestroCaptures(testInfo, workspaceCaptures);
  writeFileSync(
    testInfo.outputPath("maestro-athlete-visual-workspace.log"),
    `${athleteVisualWorkspaceResult.stdout ?? ""}\n${athleteVisualWorkspaceResult.stderr ?? ""}`,
    { mode: 0o600 },
  );
  expect(
    athleteVisualWorkspaceResult.status,
    "Home must keep its truthful goal state and selected scheduled session after returning",
  ).toBe(0);
  expect(workspaceCaptured, "Workspace flow must retain its declared capture").toBe(true);
  const manualCaptures = [
    "planned-session-detail-before-completion",
    "planned-session-full-completion",
  ] as const;
  clearMaestroCaptures(manualCaptures);
  const manualResult = runMaestro("manual-native-session.yaml", {
    MAESTRO_ACCEPTANCE_PLAN_NAME: planName,
    MAESTRO_ACCEPTANCE_SESSION_DATE: today,
    MAESTRO_ACCEPTANCE_SESSION_DAY: String(Number(today.slice(8, 10))),
    MAESTRO_ACCEPTANCE_SESSION_ID: manualSession.id,
  });
  const [detailCaptured, completionCaptured] = preserveMaestroCaptures(testInfo, manualCaptures);
  writeFileSync(
    testInfo.outputPath("maestro-manual.log"),
    `${manualResult.stdout ?? ""}\n${manualResult.stderr ?? ""}`,
    { mode: 0o600 },
  );
  expect(manualResult.status, "Native manual completion must succeed").toBe(0);
  expect(detailCaptured, "Manual flow must retain its detail capture").toBe(true);
  expect(completionCaptured, "Manual flow must retain its completion capture").toBe(true);
  const [completedSession] = await e2eDatabase.db
    .select()
    .from(plannedSessions)
    .where(eq(plannedSessions.id, manualSession.id));
  expect(completedSession).toMatchObject({
    status: "completed",
    completed_activity_id: expect.any(String),
    completion_state: "linked",
    completion_outcome: "full",
  });
  const manualActivities = await e2eDatabase.db
    .select()
    .from(activities)
    .where(eq(activities.profile_id, actor.profileId));
  expect(manualActivities).toHaveLength(1);
  expect(manualActivities[0]).toMatchObject({
    id: completedSession?.completed_activity_id,
    entry_provenance: "manual",
    elapsed_ms: null,
    distance_meters: null,
    started_at: null,
    finished_at: null,
  });
  if (!completedSession?.completed_activity_id)
    throw new Error("Manual completion did not retain its linked activity ID");
  const reopenCaptures = ["planned-session-calendar-reopen"] as const;
  clearMaestroCaptures(reopenCaptures);
  const reopenManualResult = runMaestro("reopen-manual-completion.yaml", {
    MAESTRO_ACCEPTANCE_COMPLETED_ACTIVITY_ID: completedSession.completed_activity_id,
    MAESTRO_ACCEPTANCE_SESSION_DATE: today,
    MAESTRO_ACCEPTANCE_SESSION_DAY: String(Number(today.slice(8, 10))),
  });
  const [reopenCaptured] = preserveMaestroCaptures(testInfo, reopenCaptures);
  writeFileSync(
    testInfo.outputPath("maestro-manual-reopen.log"),
    `${reopenManualResult.stdout ?? ""}\n${reopenManualResult.stderr ?? ""}`,
    { mode: 0o600 },
  );
  expect(
    reopenManualResult.status,
    "Calendar must reopen the exact linked manual activity from its selected day",
  ).toBe(0);
  expect(reopenCaptured, "Reopen flow must retain its calendar capture").toBe(true);
  return {
    actor,
    completedSession,
    manualSession,
    plan,
    planName,
    planningTimezone: profile.planning_timezone,
    profile,
    runAdb,
    runMaestro,
    today,
  };
}
