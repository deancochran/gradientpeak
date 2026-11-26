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
import {
  captureWorkspaceNativeErrors,
  type NativePlannedSessionCapture,
} from "./native-api-error-capture";

type NativeManualAcceptanceInput = {
  actor: AuthenticatedE2EActor;
  e2eDatabase: LocalE2EDatabase;
  e2eIdentity: E2EExecutionIdentity;
  outcome?: "full" | "partial" | "skip";
  workspaceOnly?: boolean;
  workspaceJourney?: WorkspaceJourney;
  testInfo: TestInfo;
};

export type WorkspaceJourney = "full" | "selected-home-only";

export const workspaceCaptures = ["athlete-workspace-selected-session"] as const;

export function workspaceFlowFor(workspaceJourney: WorkspaceJourney = "full") {
  return workspaceJourney === "full"
    ? "athlete-visual-workspace.yaml"
    : "athlete-visual-workspace-selected-home.yaml";
}

type PlanningLedgerTrainingState = {
  actual: {
    fatigue: {
      observedOn: string | null;
      source: string | null;
      status: string;
      value: number | null;
    };
    fitness: {
      observedOn: string | null;
      source: string | null;
      status: string;
      value: number | null;
    };
  };
  series: Array<{ actual: { fatigue: number; fitness: number; form: number } | null }>;
};

type PlanningLedgerResponse = {
  anchorDate: string;
  contractVersion: "planning-ledger-v3";
  period: "day" | "month" | "week";
  periodEnd: string;
  periodStart: string;
  trainingState: PlanningLedgerTrainingState;
};

function planningLedgerFrom(value: unknown): PlanningLedgerResponse {
  if (!Array.isArray(value) || value.length !== 1)
    throw new Error("Real planning ledger response was not a single tRPC result");
  const json = (value[0] as { result?: { data?: { json?: unknown } } } | undefined)?.result?.data
    ?.json;
  if (!json || typeof json !== "object")
    throw new Error("Real planning ledger response had no JSON result");
  const ledger = json as Partial<PlanningLedgerResponse>;
  if (
    ledger.contractVersion !== "planning-ledger-v3" ||
    !ledger.trainingState ||
    typeof ledger.anchorDate !== "string" ||
    typeof ledger.period !== "string" ||
    typeof ledger.periodStart !== "string" ||
    typeof ledger.periodEnd !== "string"
  ) {
    throw new Error("Real planning ledger response did not match the planning-ledger-v3 contract");
  }
  return ledger as PlanningLedgerResponse;
}

async function expectNoTrainingStateEvidence(actor: AuthenticatedE2EActor, today: string) {
  const request = { anchorDate: today, period: "day" } as const;
  const input = encodeURIComponent(JSON.stringify({ 0: { json: request } }));
  const response = await actor.request.get(
    `/api/trpc/trainingPlans.getPlanningLedger?batch=1&input=${input}`,
  );
  expect(response.ok(), `Planning ledger request failed with HTTP ${response.status()}`).toBe(true);
  const ledger = planningLedgerFrom(await response.json());
  expect(ledger).toMatchObject({
    anchorDate: today,
    period: "day",
    periodEnd: today,
    periodStart: today,
  });
  expect(ledger.trainingState.actual).toEqual({
    fatigue: { observedOn: null, source: null, status: "unavailable", value: null },
    fitness: { observedOn: null, source: null, status: "unavailable", value: null },
  });
  expect(ledger.trainingState.series.every((point) => point.actual === null)).toBe(true);
}

export function preserveMaestroCaptures(testInfo: TestInfo, captures: readonly string[]) {
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

export function clearMaestroCaptures(captures: readonly string[]) {
  for (const capture of captures) {
    rmSync(resolve(`${capture}.png`), { force: true });
  }
}

export async function completeManualNativeAcceptance({
  actor,
  e2eDatabase,
  e2eIdentity,
  outcome = "full",
  testInfo,
  workspaceOnly = false,
  workspaceJourney = "full",
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
  const ledgerDateLabel = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${today}T00:00:00.000Z`));
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
  clearMaestroCaptures(workspaceCaptures);
  const workspaceFlow = workspaceFlowFor(workspaceJourney);
  const appPid =
    workspaceOnly && workspaceJourney === "full"
      ? runAdb("shell", "pidof", "com.deancochran.gradientpeak.dev").stdout.trim().split(/\s+/)[0]
      : undefined;
  const nativeErrorCapture = captureWorkspaceNativeErrors(
    workspaceOnly && workspaceJourney === "full",
    appPid,
  );
  let athleteVisualWorkspaceResult: ReturnType<typeof runMaestro>;
  let nativeCapture: NativePlannedSessionCapture | null;
  try {
    athleteVisualWorkspaceResult = runMaestro(workspaceFlow, {
      MAESTRO_ACCEPTANCE_SESSION_DATE: today,
      MAESTRO_ACCEPTANCE_SESSION_ID: manualSession.id,
    });
  } finally {
    nativeCapture = nativeErrorCapture ? await nativeErrorCapture.stop() : null;
  }
  const [workspaceCaptured] = preserveMaestroCaptures(testInfo, workspaceCaptures);
  writeFileSync(
    testInfo.outputPath(`maestro-${workspaceFlow.replace(".yaml", "")}.log`),
    `${athleteVisualWorkspaceResult.stdout ?? ""}\n${athleteVisualWorkspaceResult.stderr ?? ""}`,
    { mode: 0o600 },
  );
  if (workspaceOnly && workspaceJourney === "full") {
    writeFileSync(
      testInfo.outputPath("planned-session-get-by-id-native-errors.json"),
      JSON.stringify(
        {
          ...(nativeCapture ?? { records: [], status: "capture_failed" }),
          source: nativeErrorCapture ? "owned-app-pid-logcat" : "app-pid-unavailable",
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  }
  expect(
    athleteVisualWorkspaceResult.status,
    workspaceJourney === "full"
      ? "Home must keep its truthful goal state and selected scheduled session after returning"
      : "Home must show the selected scheduled session before the plan-edit journey enters the library",
  ).toBe(0);
  expect(workspaceCaptured, "Workspace flow must retain its declared capture").toBe(true);
  if (workspaceOnly) {
    return {
      actor,
      completedSession: manualSession,
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
  const manualFlow =
    outcome === "full"
      ? "manual-native-session.yaml"
      : outcome === "partial"
        ? "manual-partial-native-session.yaml"
        : "manual-skip-native-session.yaml";
  const manualCompletionCapture =
    outcome === "full"
      ? "planned-session-full-completion"
      : outcome === "partial"
        ? "planned-session-partial-completion"
        : "planned-session-skip-completion";
  const manualCaptures =
    outcome === "skip"
      ? ([
          "planned-session-detail-before-completion",
          manualCompletionCapture,
          "planned-session-skip-return-ledger",
          "planning-ledger-no-evidence-training-state",
        ] as const)
      : (["planned-session-detail-before-completion", manualCompletionCapture] as const);
  clearMaestroCaptures(manualCaptures);
  const manualResult = runMaestro(manualFlow, {
    MAESTRO_ACCEPTANCE_LEDGER_DATE: ledgerDateLabel,
    MAESTRO_ACCEPTANCE_PLAN_NAME: planName,
    MAESTRO_ACCEPTANCE_SESSION_DATE: today,
    MAESTRO_ACCEPTANCE_SESSION_DAY: String(Number(today.slice(8, 10))),
    MAESTRO_ACCEPTANCE_SESSION_ID: manualSession.id,
  });
  const [detailCaptured, completionCaptured, skipReturnCaptured, skipTrainingStateCaptured] =
    preserveMaestroCaptures(testInfo, manualCaptures);
  writeFileSync(
    testInfo.outputPath("maestro-manual.log"),
    `${manualResult.stdout ?? ""}\n${manualResult.stderr ?? ""}`,
    { mode: 0o600 },
  );
  expect(
    manualResult.status,
    outcome === "full"
      ? "Native manual completion must succeed"
      : `Native manual ${outcome} action must succeed`,
  ).toBe(0);
  expect(detailCaptured, "Manual flow must retain its detail capture").toBe(true);
  expect(
    completionCaptured,
    outcome === "full"
      ? "Manual flow must retain its completion capture"
      : `Manual ${outcome} flow must retain its completion capture`,
  ).toBe(true);
  const [completedSession] = await e2eDatabase.db
    .select()
    .from(plannedSessions)
    .where(eq(plannedSessions.id, manualSession.id));
  if (!completedSession) throw new Error("Native manual action did not retain its planned session");
  if (outcome === "skip") {
    expect(skipReturnCaptured, "Skip flow must retain its ledger-return capture").toBe(true);
    expect(
      skipTrainingStateCaptured,
      "Skip flow must retain its unavailable training-state capture",
    ).toBe(true);
    expect(completedSession).toMatchObject({
      status: "completed",
      completed_activity_id: null,
      completion_state: null,
      completion_outcome: "skipped",
      skip_operation_id: expect.any(String),
    });
    expect(
      await e2eDatabase.db
        .select({ id: activities.id })
        .from(activities)
        .where(eq(activities.profile_id, actor.profileId)),
    ).toEqual([]);
    await expectNoTrainingStateEvidence(actor, today);
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
  if (outcome === "partial") {
    expect(completedSession).toMatchObject({
      status: "completed",
      completed_activity_id: expect.any(String),
      completion_state: "linked",
      completion_outcome: "partial",
    });
  } else {
    expect(completedSession).toMatchObject({
      status: "completed",
      completed_activity_id: expect.any(String),
      completion_state: "linked",
      completion_outcome: "full",
    });
  }
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
  await expectNoTrainingStateEvidence(actor, today);
  if (!completedSession?.completed_activity_id)
    throw new Error("Manual completion did not retain its linked activity ID");
  const reopenCaptures = [
    "planning-ledger-no-evidence-training-state",
    "planned-session-calendar-reopen",
  ] as const;
  clearMaestroCaptures(reopenCaptures);
  const reopenManualResult = runMaestro("reopen-manual-completion.yaml", {
    MAESTRO_ACCEPTANCE_COMPLETED_ACTIVITY_ID: completedSession.completed_activity_id,
    MAESTRO_ACCEPTANCE_SESSION_DATE: today,
    MAESTRO_ACCEPTANCE_SESSION_DAY: String(Number(today.slice(8, 10))),
  });
  const [trainingStateCaptured, reopenCaptured] = preserveMaestroCaptures(testInfo, reopenCaptures);
  writeFileSync(
    testInfo.outputPath("maestro-manual-reopen.log"),
    `${reopenManualResult.stdout ?? ""}\n${reopenManualResult.stderr ?? ""}`,
    { mode: 0o600 },
  );
  expect(
    reopenManualResult.status,
    "Calendar must reopen the exact linked manual activity from its selected day",
  ).toBe(0);
  expect(
    trainingStateCaptured,
    "Evidence-free manual completion must retain its unavailable training-state capture",
  ).toBe(true);
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
