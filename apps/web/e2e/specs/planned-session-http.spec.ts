import { buildDirectPlannedSessionCreateInput } from "@repo/api/client";
import { activityPlans, plannedSessions, profiles } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { expect, test } from "../fixtures";

test("authenticated HTTP schedules an app-created 60-second Rest run", async ({
  athleteActor,
  e2eDatabase,
  e2eIdentity,
}) => {
  const planName = e2eIdentity.name("HTTP Rest run");
  await e2eDatabase.db
    .update(profiles)
    .set({ planning_timezone: "UTC" })
    .where(eq(profiles.id, athleteActor.profileId));

  const createPlan = await athleteActor.request.post("/api/trpc/activityPlans.create?batch=1", {
    data: {
      0: {
        json: {
          name: planName,
          operationId: e2eIdentity.uuid("http-plan-operation"),
          structure: {
            version: 5,
            activity_category: "run",
            items: [
              {
                type: "step",
                id: e2eIdentity.uuid("http-rest-step"),
                duration: { type: "time", seconds: 60 },
                targets: [{ type: "rest" }],
              },
            ],
          },
        },
      },
    },
  });
  expect(createPlan.status()).toBe(200);

  const [plan] = await e2eDatabase.db
    .select({ id: activityPlans.id })
    .from(activityPlans)
    .where(
      and(eq(activityPlans.name, planName), eq(activityPlans.profile_id, athleteActor.profileId)),
    );
  expect(plan).toBeDefined();
  if (!plan) throw new Error("The HTTP-created native plan is missing.");

  const planningDate = "2026-11-23";
  const input = buildDirectPlannedSessionCreateInput({
    profileId: athleteActor.profileId,
    planningDate,
    operationId: e2eIdentity.uuid("http-session-operation"),
    activityPlanId: plan.id,
  });
  expect(input.session).not.toHaveProperty("groupEventId");
  const createSession = await athleteActor.request.post(
    "/api/trpc/plannedSessions.create?batch=1",
    { data: { 0: { json: input } } },
  );
  expect(createSession.status()).toBe(200);

  await expect
    .poll(async () =>
      e2eDatabase.db
        .select({
          activityPlanId: plannedSessions.activity_plan_id,
          planningDate: plannedSessions.planning_date,
          profileId: plannedSessions.profile_id,
          status: plannedSessions.status,
        })
        .from(plannedSessions)
        .where(eq(plannedSessions.activity_plan_id, plan.id)),
    )
    .toEqual([
      {
        activityPlanId: plan.id,
        planningDate,
        profileId: athleteActor.profileId,
        status: "scheduled",
      },
    ]);
});
