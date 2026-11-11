import { Readable } from "node:stream";
import {
  athleteConsentPolicyVersions,
  athleteDataSharingConsents,
  coachingAssignments,
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
  plannedSessions,
  profileGoals,
} from "@repo/db/schema";
import { jsonlStreamConsumer } from "@trpc/server/unstable-core-do-not-import";
import { and, eq } from "drizzle-orm";
import superjson from "superjson";
import { expect, test } from "../fixtures";
import { GoalsPage, isTrpcProcedure } from "../pages";
import {
  captureAuthoring,
  chooseAuthoringOption,
  createLocalAuthoringPage,
} from "../pages/authoring";
import { withGoalFixture, withPlanningPathFixture } from "../planning/data";
import { withLocalE2EDatabase } from "../support/database";
import { waitForAppHydration } from "../support/hydration";
import { prepareTrainingPlanPrerequisites } from "../training-plans/data";

function procedureGoalIdBatchIndices(
  request: import("@playwright/test").Request,
  procedure: string,
  goalId: string,
): number[] {
  const url = new URL(request.url());
  if (!isTrpcProcedure(url, procedure)) return [];
  const input = url.searchParams.get("input") ?? request.postData();
  if (!input) return [];
  try {
    const procedures = decodeURIComponent(
      url.pathname.slice(url.pathname.indexOf("/api/trpc/") + 10),
    ).split(",");
    const decodedInput = JSON.parse(input) as Record<string, unknown>;
    return procedures.flatMap((candidate, index) => {
      if (candidate !== procedure) return [];
      const operationInput = decodedInput[String(index)];
      if (!isRecord(operationInput) || !isRecord(operationInput.json)) return [];
      return operationInput.json.goalId === goalId ? [index] : [];
    });
  } catch {
    return [];
  }
}

function goalAssessmentBatchIndices(request: import("@playwright/test").Request, goalId: string) {
  return procedureGoalIdBatchIndices(request, "athleteIntelligence.getGoalAssessment", goalId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

async function readGoalAssessmentDto(input: {
  body: Buffer;
  procedureIndex: number;
  request: import("@playwright/test").Request;
}) {
  const url = new URL(input.request.url());
  const procedures = decodeURIComponent(
    url.pathname.slice(url.pathname.indexOf("/api/trpc/") + 10),
  ).split(",");
  if (procedures[input.procedureIndex] !== "athleteIntelligence.getGoalAssessment") {
    throw new Error("Expected a goal-assessment tRPC operation at the captured batch index.");
  }
  if (input.request.headers()["trpc-accept"] !== "application/jsonl") {
    throw new Error("Expected the goal-assessment request to negotiate the JSONL stream protocol.");
  }
  const abortController = new AbortController();
  const [head] = await jsonlStreamConsumer<Record<string, unknown>>({
    from: Readable.from([input.body]),
    deserialize: (value) => superjson.deserialize(value),
    abortController,
  });
  // Stream heads can contain deferred top-level operations; mirror httpBatchStreamLink's await.
  const operation = await Promise.resolve(head[String(input.procedureIndex)]);
  if (!isRecord(operation) || !isRecord(operation.result)) {
    throw new Error("The goal-assessment response did not contain a tRPC data envelope.");
  }
  const result = await Promise.resolve(operation.result);
  if (!isRecord(result) || !("data" in result)) {
    throw new Error("The goal-assessment response did not contain a result data envelope.");
  }
  const dto = await Promise.resolve(result.data);
  if (!isRecord(dto)) throw new Error("The goal-assessment response did not contain a DTO.");
  return dto;
}

async function captureGoalAssessment(
  page: import("@playwright/test").Page,
  goalId: string,
  stage: string,
) {
  const timeoutMs = 15_000;
  const deadlineAt = Date.now() + timeoutMs;
  const matcher = "**/api/trpc/**";
  const handlers = new Set<Promise<void>>();
  const pausedRoutes = new Set<import("@playwright/test").Route>();
  let matchingRequests = 0;
  let hasCaptureFailure = false;
  let captureFailure: unknown;
  let resolveCapture: (dto: Record<string, unknown>) => void;
  let rejectCapture: (error: unknown) => void;
  const captured = new Promise<Record<string, unknown>>((resolve, reject) => {
    resolveCapture = resolve;
    rejectCapture = reject;
  });
  // The caller awaits this promise; the immediate handler prevents a route failure from becoming
  // unhandled while the triggering click/save is still in progress.
  void captured.catch(() => undefined);
  const abortController = new AbortController();
  const failCapture = (error: unknown) => {
    if (hasCaptureFailure) return;
    hasCaptureFailure = true;
    captureFailure = error;
    rejectCapture(error);
  };
  let rejectDeadline: (error: unknown) => void;
  const deadline = new Promise<never>((_, reject) => {
    rejectDeadline = reject;
  });
  void deadline.catch(() => undefined);
  const deadlineTimer = setTimeout(() => {
    const error = new Error(`${stage} did not complete goal-assessment capture within 15 seconds.`);
    failCapture(error);
    abortController.abort(error);
    rejectDeadline(error);
  }, timeoutMs);
  const remainingTimeout = () => Math.max(1, deadlineAt - Date.now());

  const handler = async (route: import("@playwright/test").Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const procedureIndices = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      ? goalAssessmentBatchIndices(request, goalId)
      : [];
    if (procedureIndices.length === 0) {
      await route.fallback();
      return;
    }
    matchingRequests += 1;
    if (procedureIndices.length !== 1) {
      failCapture(
        new Error(`${stage} observed multiple exact goal-assessment operations in one batch.`),
      );
      await route.fallback();
      return;
    }
    if (matchingRequests !== 1) {
      failCapture(new Error(`${stage} observed more than one matching goal-assessment request.`));
      await route.fallback();
      return;
    }
    const procedureIndex = procedureIndices[0];
    if (procedureIndex === undefined) {
      failCapture(new Error(`${stage} did not expose a captured goal-assessment batch index.`));
      await route.fallback();
      return;
    }

    pausedRoutes.add(route);
    const started = (async () => {
      let fulfilled = false;
      try {
        const upstream = await route.fetch({
          signal: abortController.signal,
          timeout: remainingTimeout(),
        });
        const body = await upstream.body();
        await route.fulfill({ response: upstream });
        fulfilled = true;
        pausedRoutes.delete(route);
        if (!upstream.ok()) {
          throw new Error(`${stage} goal-assessment request returned HTTP ${upstream.status()}.`);
        }
        resolveCapture(await readGoalAssessmentDto({ body, procedureIndex, request }));
      } catch (error) {
        let routeError = error;
        if (!fulfilled && pausedRoutes.delete(route)) {
          try {
            await route.abort("failed");
          } catch (abortError) {
            routeError = new AggregateError([error, abortError], `${stage} route abort failed.`);
          }
        }
        failCapture(routeError);
        throw routeError;
      } finally {
        pausedRoutes.delete(route);
      }
    })();
    handlers.add(started);
    try {
      await started;
    } finally {
      handlers.delete(started);
    }
  };
  await page.route(matcher, handler);

  return {
    dto: () => Promise.race([captured, deadline]),
    async stop() {
      const cleanupTimeoutMs = 5_000;
      let rejectCleanupDeadline: (error: unknown) => void;
      const cleanupDeadline = new Promise<never>((_, reject) => {
        rejectCleanupDeadline = reject;
      });
      void cleanupDeadline.catch(() => undefined);
      const cleanupTimer = setTimeout(() => {
        const error = new Error(`${stage} capture cleanup did not settle within 5 seconds.`);
        abortController.abort(error);
        rejectCleanupDeadline(error);
      }, cleanupTimeoutMs);
      try {
        const cleanup = (async () => {
          const errors: unknown[] = [];
          try {
            await page.unroute(matcher, handler);
          } catch (error) {
            errors.push(error);
          }
          if (handlers.size > 0 || pausedRoutes.size > 0) {
            abortController.abort(new Error(`${stage} capture cleanup aborted active routing.`));
          }
          const abortedRoutes = await Promise.allSettled(
            [...pausedRoutes].map((route) => route.abort("failed")),
          );
          errors.push(
            ...abortedRoutes.flatMap((result) =>
              result.status === "rejected" ? [result.reason] : [],
            ),
          );
          const settledHandlers = await Promise.allSettled([...handlers]);
          errors.push(
            ...settledHandlers.flatMap((result) =>
              result.status === "rejected" ? [result.reason] : [],
            ),
          );
          if (matchingRequests !== 1) {
            errors.push(
              new Error(`${stage} expected exactly one matching goal-assessment request.`),
            );
          }
          if (hasCaptureFailure) errors.push(captureFailure);
          if (errors.length === 1) throw errors[0];
          if (errors.length > 1)
            throw new AggregateError(errors, `${stage} capture cleanup failed.`);
        })();
        await Promise.race([cleanup, cleanupDeadline]);
      } finally {
        clearTimeout(deadlineTimer);
        clearTimeout(cleanupTimer);
      }
    },
  };
}

async function withGoalAssessmentCapture<T>(input: {
  goalId: string;
  page: import("@playwright/test").Page;
  run: (dto: () => Promise<Record<string, unknown>>) => Promise<T>;
  stage: string;
}) {
  const capture = await captureGoalAssessment(input.page, input.goalId, input.stage);
  let hasPrimaryError = false;
  let primaryError: unknown;
  let hasCleanupError = false;
  let cleanupError: unknown;
  let result: T | undefined;
  try {
    result = await input.run(capture.dto);
  } catch (error) {
    hasPrimaryError = true;
    primaryError = error;
  }
  try {
    await capture.stop();
  } catch (error) {
    hasCleanupError = true;
    cleanupError = error;
  }
  if (hasPrimaryError && hasCleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      `${input.stage} and capture cleanup failed.`,
    );
  }
  if (hasPrimaryError) throw primaryError;
  if (hasCleanupError) throw cleanupError;
  return result as T;
}

function expectGoalAssessmentDto(dto: Record<string, unknown>, goalId: string) {
  expect(dto.freshness).toBe("fresh");
  expect(dto.rebuildStatus).toBe("fresh");
  expect(dto.stateRevision).toEqual(expect.any(Number));
  expect(dto.assessmentConfidence).toEqual(expect.any(Number));
  expect(dto.assessmentConfidence as number).toBeGreaterThanOrEqual(0);
  expect(dto.assessmentConfidence as number).toBeLessThanOrEqual(1);
  expect(typeof dto.computedAt).toBe("string");
  expect(Number.isNaN(Date.parse(dto.computedAt as string))).toBe(false);
  expect(dto.assessment).not.toBeNull();
  expect(isRecord(dto.assessment)).toBe(true);
  const assessment = dto.assessment as Record<string, unknown>;
  expect(assessment.goalId).toBe(goalId);
  expect(typeof assessment.assessedAt).toBe("string");
  expect(Number.isNaN(Date.parse(assessment.assessedAt as string))).toBe(false);
  expect(assessment.assessmentConfidence).toEqual(expect.any(Number));
  expect(assessment.assessmentConfidence as number).toBeGreaterThanOrEqual(0);
  expect(assessment.assessmentConfidence as number).toBeLessThanOrEqual(1);
}

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

test("[coaching-a04] athlete revision refreshes goal detail and reassessment without changing scheduled training", async ({
  athleteActor,
  coachActor,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(120_000);
  const athletePage = await createLocalAuthoringPage(athleteActor);
  let restoreAssessmentPrerequisites: (() => Promise<void>) | undefined;

  try {
    // This prepares a disposable persisted baseline; worker publication is not exercised here.
    restoreAssessmentPrerequisites = await prepareTrainingPlanPrerequisites(athleteActor);
    await withPlanningPathFixture(testInfo, async (planning) => {
      await withGoalFixture(async (goalsFixture) => {
        const originalTitle = e2eIdentity.name("A04 reassessment goal");
        const revisedTitle = `${originalTitle} revised`;
        const goals = new GoalsPage(athletePage);

        await goals.startCreate("2026-12-01");
        await waitForAppHydration(athletePage);
        const createForm = athletePage.getByTestId("goal-form");
        await createForm.getByLabel("Title", { exact: true }).fill(originalTitle);
        await chooseAuthoringOption(athletePage, "Goal type", "Race performance");
        await createForm.getByLabel("Distance (km)", { exact: true }).fill("5");
        await createForm.getByLabel("Goal time", { exact: true }).fill("25:00");
        goalsFixture.rememberGoalTitle(originalTitle);
        await createForm.getByTestId("goal-submit").click();

        const card = athletePage
          .locator('[data-testid^="goal-card-"]')
          .filter({ hasText: originalTitle });
        await expect(card).toBeVisible();
        const testId = await card.getAttribute("data-testid");
        const goalId = testId?.replace("goal-card-", "");
        if (!goalId) throw new Error("The disposable A04 goal did not expose an ID.");
        goalsFixture.rememberGoal(goalId);
        await waitForAppHydration(athletePage);

        const [scheduledBefore] = await e2eDatabase.db
          .select()
          .from(plannedSessions)
          .where(
            and(
              eq(plannedSessions.id, planning.eventId),
              eq(plannedSessions.profile_id, athleteActor.profileId),
            ),
          );
        if (!scheduledBefore) throw new Error("The disposable planned-session fixture is missing.");

        await withGoalAssessmentCapture({
          page: athletePage,
          goalId,
          stage: "Initial goal detail",
          run: async (dto) => {
            await card.click();
            await expect(
              athletePage.getByRole("heading", { name: originalTitle, exact: true }),
            ).toBeVisible();
            await expect(athletePage.getByTestId("goal-intelligence")).toBeVisible();
            expectGoalAssessmentDto(await dto(), goalId);
          },
        });
        await expect(
          athletePage.getByText("Loading readiness assessment...", { exact: true }),
        ).toHaveCount(0);
        await waitForAppHydration(athletePage);
        await athletePage.getByTestId(`goal-edit-${goalId}`).click();
        await waitForAppHydration(athletePage);

        const canceledEdit = athletePage.getByTestId("goal-form");
        await canceledEdit.getByLabel("Title", { exact: true }).fill("Discarded A04 edit");
        await canceledEdit.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(athletePage).toHaveURL(new RegExp(`/goals/${goalId}(?:\\?|$)`));
        await expect
          .poll(async () =>
            e2eDatabase.db
              .select({ targetPayload: profileGoals.target_payload, title: profileGoals.title })
              .from(profileGoals)
              .where(
                and(
                  eq(profileGoals.id, goalId),
                  eq(profileGoals.profile_id, athleteActor.profileId),
                ),
              ),
          )
          .toEqual([
            {
              targetPayload: {
                type: "event_performance",
                activity_category: "run",
                distance_m: 5000,
                target_time_s: 1500,
              },
              title: originalTitle,
            },
          ]);
        await athletePage.reload();
        await expect(
          athletePage.getByRole("heading", { name: originalTitle, exact: true }),
        ).toBeVisible();
        await expect(athletePage.getByText("5 km · 25:00", { exact: true })).toBeVisible();
        await waitForAppHydration(athletePage);
        await athletePage.getByTestId(`goal-edit-${goalId}`).click();
        await waitForAppHydration(athletePage);

        const editForm = athletePage.getByTestId("goal-form");
        await editForm.getByLabel("Title", { exact: true }).fill(revisedTitle);
        await editForm.getByLabel("Distance (km)", { exact: true }).fill("10");
        await editForm.getByLabel("Goal time", { exact: true }).fill("40:00");
        await withGoalAssessmentCapture({
          page: athletePage,
          goalId,
          stage: "Post-save goal reassessment",
          run: async (dto) => {
            await editForm.getByTestId("goal-submit").click();
            expectGoalAssessmentDto(await dto(), goalId);
          },
        });

        await expect(
          athletePage.getByRole("heading", { name: revisedTitle, exact: true }),
        ).toBeVisible();
        await expect(athletePage.getByText("Goal updated", { exact: true })).toBeVisible();
        await expect(athletePage.getByTestId("goal-intelligence")).toBeVisible();
        await expect(athletePage.getByText("10 km · 40:00", { exact: true })).toBeVisible();
        await expect(athletePage.getByText("fresh state", { exact: true })).toBeVisible();
        await expect(athletePage.getByText(/^As of /i)).toBeVisible();

        for (const viewport of [
          { width: 1440, height: 1000 },
          { width: 390, height: 844 },
        ]) {
          await athletePage.setViewportSize(viewport);
          const captureName = `a04-goal-reassessment-${viewport.width}`;
          const heading = athletePage.getByRole("heading", { name: revisedTitle, exact: true });
          const intelligence = athletePage.getByTestId("goal-intelligence");
          await athletePage.evaluate(() => window.scrollTo(0, 0));
          await captureAuthoring(athletePage, testInfo, `${captureName}-top`, [heading]);
          await intelligence.scrollIntoViewIfNeeded();
          await captureAuthoring(athletePage, testInfo, `${captureName}-assessment`, [
            intelligence,
          ]);
          const contextPath = testInfo.outputPath(`${captureName}-context.png`);
          await athletePage.screenshot({ path: contextPath, fullPage: true, scale: "css" });
          await testInfo.attach(`${captureName}-context`, {
            path: contextPath,
            contentType: "image/png",
          });
        }

        await athletePage.reload();
        await expect(
          athletePage.getByRole("heading", { name: revisedTitle, exact: true }),
        ).toBeVisible();
        await expect(athletePage.getByText("10 km · 40:00", { exact: true })).toBeVisible();
        await expect(athletePage.getByText("fresh state", { exact: true })).toBeVisible();
        await expect
          .poll(async () =>
            e2eDatabase.db
              .select({ targetPayload: profileGoals.target_payload, title: profileGoals.title })
              .from(profileGoals)
              .where(
                and(
                  eq(profileGoals.id, goalId),
                  eq(profileGoals.profile_id, athleteActor.profileId),
                ),
              ),
          )
          .toEqual([
            {
              targetPayload: {
                type: "event_performance",
                activity_category: "run",
                distance_m: 10000,
                target_time_s: 2400,
              },
              title: revisedTitle,
            },
          ]);

        const [scheduledAfter] = await e2eDatabase.db
          .select()
          .from(plannedSessions)
          .where(
            and(
              eq(plannedSessions.id, planning.eventId),
              eq(plannedSessions.profile_id, athleteActor.profileId),
            ),
          );
        expect(scheduledAfter).toEqual(scheduledBefore);

        await athletePage.goto("/organizations/new");
        await athletePage.getByLabel("Organization name", { exact: true }).fill("A04 access proof");
        await athletePage
          .getByLabel("Organization URL name", { exact: true })
          .fill(`a04-${e2eIdentity.uuid("organization")}`);
        await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
        await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/i);
        const organizationId = new URL(athletePage.url()).pathname.match(
          /\/organizations\/([0-9a-f-]{36})\/dashboard$/i,
        )?.[1];
        if (!organizationId) throw new Error("Organization creation did not yield a UUID.");
        const coachMembershipId = e2eIdentity.uuid("a04-coach-membership");
        const engagementId = e2eIdentity.uuid("a04-engagement");
        const assignmentId = e2eIdentity.uuid("a04-assignment");
        const roleGrantId = e2eIdentity.uuid("a04-coach-role-grant");
        const consentId = e2eIdentity.uuid("a04-goals-consent");
        const policyId = e2eIdentity.uuid("a04-goals-policy");
        // The beforeEach guard limits this accepted coaching history to the runner-owned
        // disposable database. It is retained by production policy, so its whole target is
        // destroyed by the outer managed lifecycle rather than deleting individual rows.
        await withLocalE2EDatabase(async (database) => {
          await database.typedTransaction(async (transaction) => {
            await transaction.insert(organizationMemberships).values({
              id: coachMembershipId,
              organization_id: organizationId,
              profile_id: coachActor.profileId,
            });
            await transaction.insert(organizationMembershipRoleGrants).values({
              id: roleGrantId,
              organization_id: organizationId,
              membership_id: coachMembershipId,
              role_key: "coach",
            });
            await transaction.insert(coachingEngagements).values({
              id: engagementId,
              organization_id: organizationId,
              athlete_profile_id: athleteActor.profileId,
            });
            await transaction.insert(coachingAssignments).values({
              id: assignmentId,
              organization_id: organizationId,
              engagement_id: engagementId,
              coach_membership_id: coachMembershipId,
              assignment_kind: "primary",
            });
            await transaction.insert(athleteConsentPolicyVersions).values({
              id: policyId,
              scope_key: "goals",
              effective_from: new Date(Date.now() - 1000),
              jurisdiction: "e2e",
              terms_text: "Disposable A04 goals consent",
              content_digest: `sha256:${policyId}`,
            });
            await transaction.insert(athleteDataSharingConsents).values({
              id: consentId,
              organization_id: organizationId,
              engagement_id: engagementId,
              athlete_profile_id: athleteActor.profileId,
              scope_key: "goals",
              policy_version_id: policyId,
              granted_by_profile_id: athleteActor.profileId,
            });
          });
        });

        const coachPage = await coachActor.createPage();
        try {
          await coachPage.goto(
            `/organizations/${organizationId}/athletes/${athleteActor.profileId}`,
          );
          await waitForAppHydration(coachPage);
          await expect(
            coachPage.getByRole("heading", { name: "Goals", exact: true }),
          ).toBeVisible();
          await expect(coachPage.getByText(revisedTitle, { exact: true })).toBeVisible();

          const deniedEditor = await coachPage.goto(`/goals/${goalId}/edit`, {
            timeout: 5_000,
            waitUntil: "commit",
          });
          expect(deniedEditor?.status()).toBe(404);
          await expect(
            coachPage.getByRole("heading", { name: "Page not found", exact: true }),
          ).toBeVisible();
          await expect(coachPage.getByTestId("goal-form")).toHaveCount(0);
          await expect(coachPage.getByText(originalTitle, { exact: true })).toHaveCount(0);
          await expect(coachPage.getByText(revisedTitle, { exact: true })).toHaveCount(0);
        } finally {
          await coachPage.close();
        }
      });
    });
  } finally {
    try {
      await restoreAssessmentPrerequisites?.();
    } finally {
      await athletePage.context().close();
    }
  }
});
