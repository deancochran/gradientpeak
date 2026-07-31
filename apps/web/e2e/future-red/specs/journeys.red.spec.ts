import { test } from "../../fixtures";
import { test as messagingTest } from "../../fixtures/messaging";
import { test as authLaneTest } from "../../lane-support/auth/lane-test";
import { futureJourneyExecutorById } from "../executors";
import { futureJourneyBlueprints } from "../registry";
import { assertFutureJourneyRegistry, canonicalFutureJourneyById } from "../registry-contract";
import { runFutureJourney } from "../run-journey";
import type { FutureJourneyActor, FutureJourneyBlueprint } from "../types";

assertFutureJourneyRegistry();

const blueprintsByActor = new Map<FutureJourneyActor, FutureJourneyBlueprint[]>([
  ["anonymous", []],
  ["athlete", []],
  ["authLane", []],
  ["coach", []],
  ["messaging", []],
  ["onboarding", []],
  ["profile", []],
  ["unverified", []],
]);

for (const blueprint of futureJourneyBlueprints) {
  blueprintsByActor.get(blueprint.actor)?.push(blueprint);
}

function testTitle(blueprint: FutureJourneyBlueprint): string {
  const canonical = canonicalFutureJourneyById.get(blueprint.id);
  if (!canonical) {
    throw new Error(`Missing canonical metadata for future-red journey ${blueprint.id}.`);
  }
  return `${blueprint.id}: ${canonical.title}`;
}

function executorFor(blueprint: FutureJourneyBlueprint) {
  return futureJourneyExecutorById.get(blueprint.id);
}

function executorOptions(blueprint: FutureJourneyBlueprint) {
  const executor = executorFor(blueprint);
  return executor ? { executor } : {};
}

test.describe("future-red anonymous journeys", () => {
  for (const blueprint of blueprintsByActor.get("anonymous") ?? []) {
    test(testTitle(blueprint), async ({ page }, testInfo) => {
      await runFutureJourney(page, testInfo, blueprint, executorOptions(blueprint));
    });
  }
});

test.describe("future-red athlete journeys", () => {
  for (const blueprint of blueprintsByActor.get("athlete") ?? []) {
    test(testTitle(blueprint), async ({ athletePage }, testInfo) => {
      await runFutureJourney(athletePage, testInfo, blueprint, executorOptions(blueprint));
    });
  }
});

authLaneTest.describe("future-red captured-email auth journeys", () => {
  for (const blueprint of blueprintsByActor.get("authLane") ?? []) {
    authLaneTest(testTitle(blueprint), async ({ browser, laneServer, page }, testInfo) => {
      await runFutureJourney(page, testInfo, blueprint, {
        baseURL: laneServer.baseURL,
        browser,
        ...executorOptions(blueprint),
      });
    });
  }
});

test.describe("future-red coach journeys", () => {
  for (const blueprint of blueprintsByActor.get("coach") ?? []) {
    test(testTitle(blueprint), async ({ coachPage }, testInfo) => {
      await runFutureJourney(coachPage, testInfo, blueprint, executorOptions(blueprint));
    });
  }
});

messagingTest.describe("future-red messaging journeys", () => {
  for (const blueprint of blueprintsByActor.get("messaging") ?? []) {
    messagingTest(testTitle(blueprint), async ({ messaging }, testInfo) => {
      await runFutureJourney(
        messaging.actors.a.page,
        testInfo,
        blueprint,
        executorOptions(blueprint),
      );
    });
  }
});

test.describe("future-red onboarding journeys", () => {
  for (const blueprint of blueprintsByActor.get("onboarding") ?? []) {
    test(testTitle(blueprint), async ({ onboardingPage }, testInfo) => {
      await runFutureJourney(onboardingPage, testInfo, blueprint, executorOptions(blueprint));
    });
  }
});

test.describe("future-red profile journeys", () => {
  for (const blueprint of blueprintsByActor.get("profile") ?? []) {
    test(testTitle(blueprint), async ({ profilePage }, testInfo) => {
      await runFutureJourney(profilePage, testInfo, blueprint, executorOptions(blueprint));
    });
  }
});

test.describe("future-red unverified journeys", () => {
  for (const blueprint of blueprintsByActor.get("unverified") ?? []) {
    test(testTitle(blueprint), async ({ unverifiedPage }, testInfo) => {
      await runFutureJourney(unverifiedPage, testInfo, blueprint, executorOptions(blueprint));
    });
  }
});
