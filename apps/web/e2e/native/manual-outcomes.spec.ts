import { activityPlans } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { completeManualNativeAcceptance } from "./current-candidate-support";

test("current Android candidate preserves a partial manual completion and reopens its exact activity", async ({
  onboardingActor: actor,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(600_000);
  const { completedSession, plan } = await completeManualNativeAcceptance({
    actor,
    e2eDatabase,
    e2eIdentity,
    outcome: "partial",
    testInfo,
  });

  expect(completedSession).toMatchObject({
    activity_plan_id: plan.id,
    completion_outcome: "partial",
    completed_activity_id: expect.any(String),
    completion_state: "linked",
    status: "completed",
  });
  expect(
    await e2eDatabase.db
      .select({ id: activityPlans.id, structure: activityPlans.structure })
      .from(activityPlans)
      .where(eq(activityPlans.id, plan.id)),
  ).toEqual([{ id: plan.id, structure: plan.structure }]);
});

test("current Android candidate records explicit skip without fabricating a manual activity", async ({
  onboardingActor: actor,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(600_000);
  const { completedSession } = await completeManualNativeAcceptance({
    actor,
    e2eDatabase,
    e2eIdentity,
    outcome: "skip",
    testInfo,
  });

  expect(completedSession).toMatchObject({
    completed_activity_id: null,
    completion_outcome: "skipped",
    completion_state: null,
    skip_operation_id: expect.any(String),
    status: "completed",
  });
});
