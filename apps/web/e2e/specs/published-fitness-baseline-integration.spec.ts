import { Readable } from "node:stream";
import type { Page, Route } from "@playwright/test";
import { ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION } from "@repo/core";
import { isValidDateOnlyUtc } from "@repo/core/calendar";
import { addDaysDateKey } from "@repo/core/plan/trainingLoadTimeline";
import { dailyTrainingLoad, plannedSessions, profileAthleteState } from "@repo/db/schema";
import { jsonlStreamConsumer } from "@trpc/server/unstable-core-do-not-import";
import { and, eq } from "drizzle-orm";
import superjson from "superjson";
import { expect, test } from "../fixtures";
import { expectNoHorizontalOverflow } from "../pages";
import { withPlanningPathFixture } from "../planning/data";
import { LocalE2EDatabase } from "../support/database";

type FitnessPoint = {
  date: string;
  loadBalance: number;
  longTermLoad: number;
  recentLoad: number;
};

type PlanProjection = {
  contractVersion: "plan-tab-projection-v2";
  fitness: { actual: FitnessPoint[] };
  fitnessHistory?: { maturity: null; status: "unavailable"; verifiedThrough: null };
  today: string | null;
};

type CapturedProjection = {
  projection: PlanProjection;
  requestRange: { endDate: string; startDate: string };
  requestUrl: string;
  startSeq: number;
};

type PublishedFixture = {
  assertUnchanged: () => Promise<void>;
  setBaseline: (fitness: number) => Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function fitnessPoint(value: unknown): FitnessPoint | undefined {
  if (
    !isRecord(value) ||
    typeof value.date !== "string" ||
    typeof value.longTermLoad !== "number" ||
    typeof value.recentLoad !== "number" ||
    typeof value.loadBalance !== "number"
  ) {
    return undefined;
  }
  return {
    date: value.date,
    longTermLoad: value.longTermLoad,
    recentLoad: value.recentLoad,
    loadBalance: value.loadBalance,
  };
}

function findProjection(value: unknown): PlanProjection | undefined {
  if (!isRecord(value)) return undefined;
  if (value.contractVersion === "plan-tab-projection-v2" && isRecord(value.fitness)) {
    const actual = value.fitness.actual;
    const points: FitnessPoint[] = [];
    if (Array.isArray(actual)) {
      for (const point of actual) {
        const parsed = fitnessPoint(point);
        if (!parsed) return undefined;
        points.push(parsed);
      }
    }
    if (Array.isArray(actual) && (value.today === null || typeof value.today === "string")) {
      const history =
        isRecord(value.fitnessHistory) &&
        value.fitnessHistory.status === "unavailable" &&
        value.fitnessHistory.verifiedThrough === null &&
        value.fitnessHistory.maturity === null
          ? { status: "unavailable" as const, verifiedThrough: null, maturity: null }
          : undefined;
      return {
        contractVersion: "plan-tab-projection-v2",
        fitness: { actual: points },
        ...(history ? { fitnessHistory: history } : {}),
        today: value.today,
      };
    }
  }
  for (const child of Object.values(value)) {
    const projection = findProjection(child);
    if (projection) return projection;
  }
  return undefined;
}

async function decodePlanProjection(input: {
  body: Buffer;
  request: import("@playwright/test").Request;
  startSeq: number;
}): Promise<CapturedProjection> {
  if (input.request.headers()["trpc-accept"] !== "application/jsonl") {
    throw new Error("Plan projection request did not negotiate the JSONL stream protocol.");
  }
  const requestUrl = new URL(input.request.url());
  const operations = decodeURIComponent(
    requestUrl.pathname.slice(requestUrl.pathname.indexOf("/api/trpc/") + 10),
  ).split(",");
  const index = operations.indexOf("trainingPlans.getPlanTabProjection");
  if (index < 0) throw new Error("Captured request did not contain the plan projection operation.");
  const [head] = await jsonlStreamConsumer<Record<string, unknown>>({
    from: Readable.from([input.body]),
    deserialize: (value) => superjson.deserialize(value),
    abortController: new AbortController(),
  });
  const operation = await Promise.resolve(head[String(index)]);
  if (!isRecord(operation) || !isRecord(operation.result)) {
    throw new Error("Plan projection response did not contain a tRPC data envelope.");
  }
  const result = await Promise.resolve(operation.result);
  if (!isRecord(result) || !("data" in result)) {
    throw new Error("Plan projection response did not contain projection data.");
  }
  const projection = findProjection(await Promise.resolve(result.data));
  if (!projection) throw new Error("Plan projection response did not contain the projection DTO.");
  const encodedInput = requestUrl.searchParams.get("input") ?? input.request.postData();
  if (!encodedInput) throw new Error("Plan projection request did not include tRPC input.");
  let batchInput: Record<string, unknown>;
  try {
    batchInput = JSON.parse(encodedInput) as Record<string, unknown>;
  } catch {
    throw new Error("Plan projection request input was not JSON.");
  }
  const operationInput = batchInput[String(index)];
  if (!isRecord(operationInput) || !isRecord(operationInput.json)) {
    throw new Error("Plan projection request did not include the operation input.");
  }
  const { startDate, endDate } = operationInput.json;
  if (
    typeof startDate !== "string" ||
    typeof endDate !== "string" ||
    !isValidDateOnlyUtc(startDate) ||
    !isValidDateOnlyUtc(endDate)
  ) {
    throw new Error("Plan projection request range was not canonical UTC dates.");
  }
  return {
    projection,
    requestRange: { startDate, endDate },
    requestUrl: input.request.url(),
    startSeq: input.startSeq,
  };
}

async function withPersistedPublishedBaseline(
  profileId: string,
  expectedToday: string,
  plannedSessionId: string,
  run: (fixture: PublishedFixture) => Promise<void>,
) {
  const database = new LocalE2EDatabase();
  const [[previousState], previousLoads, [plannedSession]] = await Promise.all([
    database.db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId))
      .limit(1),
    database.db.select().from(dailyTrainingLoad).where(eq(dailyTrainingLoad.profile_id, profileId)),
    database.db
      .select()
      .from(plannedSessions)
      .where(
        and(eq(plannedSessions.id, plannedSessionId), eq(plannedSessions.profile_id, profileId)),
      )
      .limit(1),
  ]);
  if (!plannedSession) throw new Error("Expected the owned planning fixture session.");
  const writeBaseline = async (fitness: number) => {
    const now = new Date();
    if (now.toISOString().slice(0, 10) !== expectedToday) {
      throw new Error(
        "UTC day changed during fixture setup; rerun against one canonical planning day.",
      );
    }
    await database.typedTransaction((transaction) =>
      transaction
        .insert(profileAthleteState)
        .values({
          profile_id: profileId,
          source_revision: 1,
          published_revision: 1,
          dirty_from_at: null,
          fitness,
          fatigue: fitness === 0 ? 0 : 47,
          evidence_confidence: 0.8,
          algorithm_version: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
          computed_at: now,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: profileAthleteState.profile_id,
          set: {
            source_revision: 1,
            published_revision: 1,
            dirty_from_at: null,
            fitness,
            fatigue: fitness === 0 ? 0 : 47,
            evidence_confidence: 0.8,
            algorithm_version: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
            computed_at: now,
            updated_at: now,
          },
        }),
    );
  };
  try {
    await database.typedTransaction((transaction) =>
      transaction.delete(dailyTrainingLoad).where(eq(dailyTrainingLoad.profile_id, profileId)),
    );
    // A persisted current publication with no persisted daily history is intentionally unavailable.
    await writeBaseline(0);
    let baselineState = await database.db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId));
    let baselineLoads = await database.db
      .select()
      .from(dailyTrainingLoad)
      .where(eq(dailyTrainingLoad.profile_id, profileId));
    expect(baselineLoads).toEqual([]);
    expect(baselineState).toHaveLength(1);
    expect(baselineState[0]).toMatchObject({
      profile_id: profileId,
      source_revision: 1,
      published_revision: 1,
      fitness: 0,
      fatigue: 0,
    });
    expect(baselineState[0]?.computed_at?.toISOString().slice(0, 10)).toBe(expectedToday);
    await run({
      setBaseline: async (fitness) => {
        await writeBaseline(fitness);
        baselineState = await database.db
          .select()
          .from(profileAthleteState)
          .where(eq(profileAthleteState.profile_id, profileId));
        baselineLoads = await database.db
          .select()
          .from(dailyTrainingLoad)
          .where(eq(dailyTrainingLoad.profile_id, profileId));
      },
      assertUnchanged: async () => {
        expect(
          await database.db
            .select()
            .from(profileAthleteState)
            .where(eq(profileAthleteState.profile_id, profileId)),
        ).toEqual(baselineState);
        expect(
          await database.db
            .select()
            .from(dailyTrainingLoad)
            .where(eq(dailyTrainingLoad.profile_id, profileId)),
        ).toEqual(baselineLoads);
        expect(
          await database.db
            .select()
            .from(plannedSessions)
            .where(
              and(
                eq(plannedSessions.id, plannedSessionId),
                eq(plannedSessions.profile_id, profileId),
              ),
            ),
        ).toEqual([plannedSession]);
      },
    });
  } finally {
    try {
      await database.typedTransaction(async (transaction) => {
        await transaction
          .delete(dailyTrainingLoad)
          .where(eq(dailyTrainingLoad.profile_id, profileId));
        if (previousLoads.length) await transaction.insert(dailyTrainingLoad).values(previousLoads);
        await transaction
          .delete(profileAthleteState)
          .where(eq(profileAthleteState.profile_id, profileId));
        if (previousState) await transaction.insert(profileAthleteState).values(previousState);
      });
    } finally {
      await database.close();
    }
  }
}

async function captureForwardedProjection(page: Page) {
  const matcher = /\/api\/trpc\/.*trainingPlans\.getPlanTabProjection/;
  const captures: CapturedProjection[] = [];
  const waiters: Array<{
    cursor: number;
    expectedRange: CapturedProjection["requestRange"];
    resolve: (capture: CapturedProjection) => void;
  }> = [];
  let started = 0;
  const handler = async (route: Route) => {
    const startSeq = ++started;
    const response = await route.fetch();
    const body = await response.body();
    // Forward untouched application bytes; stream decoding is observation only.
    await route.fulfill({ response, body });
    const capture = await decodePlanProjection({ body, request: route.request(), startSeq });
    captures.push(capture);
    const waiterIndex = waiters.findIndex(
      (waiter) =>
        capture.startSeq > waiter.cursor &&
        capture.requestRange.startDate === waiter.expectedRange.startDate &&
        capture.requestRange.endDate === waiter.expectedRange.endDate,
    );
    if (waiterIndex >= 0) waiters.splice(waiterIndex, 1)[0]?.resolve(capture);
  };
  await page.route(matcher, handler);
  return {
    after: (cursor: number, expectedRange: CapturedProjection["requestRange"]) =>
      new Promise<CapturedProjection>((resolve) => {
        const matches = (candidate: CapturedProjection) =>
          candidate.startSeq > cursor &&
          candidate.requestRange.startDate === expectedRange.startDate &&
          candidate.requestRange.endDate === expectedRange.endDate;
        const capture = captures.find(matches);
        if (capture) resolve(capture);
        else waiters.push({ cursor, expectedRange, resolve });
      }),
    cursor: () => started,
    stop: () => page.unroute(matcher, handler),
  };
}

async function assertPublishedBaseline(
  chart: import("@playwright/test").Locator,
  captured: CapturedProjection,
  expectedToday: string,
  expectedFitness: number,
  expectedRange: CapturedProjection["requestRange"],
) {
  const { projection } = captured;
  expect(captured.requestUrl).toContain("trainingPlans.getPlanTabProjection");
  expect(captured.requestRange).toEqual(expectedRange);
  expect(projection.today).toBe(expectedToday);
  expect(isValidDateOnlyUtc(projection.today ?? "")).toBe(true);
  expect(projection.fitnessHistory).toEqual({
    status: "unavailable",
    verifiedThrough: null,
    maturity: null,
  });
  expect(projection.fitness.actual).toEqual([
    {
      date: expectedToday,
      longTermLoad: expectedFitness,
      recentLoad: expectedFitness === 0 ? 0 : 47,
      loadBalance: expectedFitness === 0 ? 0 : -5,
    },
  ]);
  await expect(
    chart.getByLabel("Chart legend").getByText("Published current model-derived fitness", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(chart).toContainText(
    `Published current model-derived fitness: 1 daily value, latest ${expectedFitness} on ${expectedToday}.`,
  );
  await expect(chart).not.toContainText(/verified through/i);
}

test("Plan renders persisted published baselines without verified history", async ({
  athleteActor,
  athletePage,
}, testInfo) => {
  await withPlanningPathFixture(testInfo, async (planning) => {
    if (!planning.eventId)
      throw new Error("Planning fixture did not create an owned planned session.");
    if (!isValidDateOnlyUtc(planning.startDate))
      throw new Error("Planning fixture start date is not UTC.");
    await withPersistedPublishedBaseline(
      athleteActor.profileId,
      planning.startDate,
      planning.eventId,
      async (fixture) => {
        const capture = await captureForwardedProjection(athletePage);
        const projectionRange = (anchorDate: string) => ({
          startDate: addDaysDateKey(anchorDate, -42),
          endDate: addDaysDateKey(anchorDate, 47),
        });
        try {
          for (const viewport of [
            { label: "desktop", width: 1440, height: 1000 },
            { label: "compact", width: 390, height: 844 },
          ]) {
            await athletePage.setViewportSize({ width: viewport.width, height: viewport.height });
            await fixture.setBaseline(0);
            let cursor = capture.cursor();
            const initialRange = projectionRange(planning.startDate);
            const initial = capture.after(cursor, initialRange);
            await athletePage.goto("/plan");
            const chart = athletePage.getByRole("region", { name: "Daily training chart" });
            await expect(chart).toBeVisible();
            await assertPublishedBaseline(
              chart,
              await initial,
              planning.startDate,
              0,
              initialRange,
            );
            await expectNoHorizontalOverflow(athletePage);
            const zeroPath = testInfo.outputPath(
              `persisted-published-baseline-zero-${viewport.label}.png`,
            );
            await athletePage.screenshot({ fullPage: true, path: zeroPath });
            await testInfo.attach(`persisted-published-baseline-zero-${viewport.label}.png`, {
              path: zeroPath,
              contentType: "image/png",
            });

            const selectedDate = athletePage.getByLabel("Selected day");
            const expectedSelectedDate = addDaysDateKey(planning.startDate, 1);
            const selectedRange = projectionRange(expectedSelectedDate);
            cursor = capture.cursor();
            const selected = capture.after(cursor, selectedRange);
            await athletePage.getByRole("button", { name: "Next day" }).click();
            await expect(selectedDate).toHaveValue(expectedSelectedDate);
            await expect(athletePage).toHaveURL(`/plan?date=${expectedSelectedDate}`);
            await assertPublishedBaseline(
              chart,
              await selected,
              planning.startDate,
              0,
              selectedRange,
            );
            await fixture.assertUnchanged();
            const selectedPath = testInfo.outputPath(
              `persisted-published-baseline-selected-${viewport.label}.png`,
            );
            await athletePage.screenshot({ fullPage: true, path: selectedPath });
            await testInfo.attach(`persisted-published-baseline-selected-${viewport.label}.png`, {
              path: selectedPath,
              contentType: "image/png",
            });

            cursor = capture.cursor();
            const reopenedZero = capture.after(cursor, selectedRange);
            await athletePage.reload();
            await expect(selectedDate).toHaveValue(expectedSelectedDate);
            await assertPublishedBaseline(
              chart,
              await reopenedZero,
              planning.startDate,
              0,
              selectedRange,
            );
            await fixture.assertUnchanged();

            await fixture.setBaseline(42);
            cursor = capture.cursor();
            const reopenedNonzero = capture.after(cursor, selectedRange);
            await athletePage.reload();
            await expect(selectedDate).toHaveValue(expectedSelectedDate);
            await assertPublishedBaseline(
              chart,
              await reopenedNonzero,
              planning.startDate,
              42,
              selectedRange,
            );
            await fixture.assertUnchanged();
            const nonzeroPath = testInfo.outputPath(
              `persisted-published-baseline-nonzero-reopened-${viewport.label}.png`,
            );
            await athletePage.screenshot({ fullPage: true, path: nonzeroPath });
            await testInfo.attach(
              `persisted-published-baseline-nonzero-reopened-${viewport.label}.png`,
              {
                path: nonzeroPath,
                contentType: "image/png",
              },
            );
          }
        } finally {
          await capture.stop();
        }
      },
    );
  });
});
