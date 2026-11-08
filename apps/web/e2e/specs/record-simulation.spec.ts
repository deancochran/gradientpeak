import type { Request } from "@playwright/test";
import { activities, plannedSessions } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { RoutesPage } from "../pages";

// Authored for the guarded actor-owned harness. The coordinator runs this journey;
// implementation verification does not seed or mutate a database.
test("[P0] plan/route simulation uses full geometry and never creates activity or calendar history", async ({
  athletePage,
  athleteActor,
  e2eData,
  e2eDatabase,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(60_000);
  if (!athleteActor.profileId) throw new Error("An owned athlete profile is required");
  const plan = await e2eData.activityPlans.create({
    actorEmail: athleteActor.email,
    label: "simulation-plan",
  });
  const routeName = e2eIdentity.name("Simulation full route");
  const routes = new RoutesPage(athletePage);
  const routeId = await routes.upload(
    {
      name: "simulation-route.gpx",
      mimeType: "application/gpx+xml",
      buffer: Buffer.from(
        `<gpx version="1.1"><trk><name>Simulation reference</name><trkseg><trkpt lat="0" lon="179.999"><ele>10</ele></trkpt><trkpt lat="0" lon="-179.999" /></trkseg></trk></gpx>`,
      ),
    },
    routeName,
  );
  e2eData.routes.register(routeId);
  const beforeActivities = await e2eDatabase.db
    .select()
    .from(activities)
    .where(eq(activities.profile_id, athleteActor.profileId));
  const beforeSessions = await e2eDatabase.db
    .select()
    .from(plannedSessions)
    .where(eq(plannedSessions.profile_id, athleteActor.profileId));
  const writes: string[] = [];
  const watch = (request: Request) => {
    if (
      request.method() === "POST" &&
      /(?:createFromRecordingSummary|beginMobileRecordingUpload|recordSessionRpe|calendar\.(?:schedule|complete|mutate))/.test(
        request.url(),
      )
    )
      writes.push(request.url());
  };
  athletePage.on("request", watch);
  try {
    await athletePage.goto(
      `/record?activityPlanId=${plan.id}&routeId=${routeId}&activity_category=bike`,
    );
    await athletePage.getByRole("link", { name: "Try simulation", exact: true }).click();
    await expect(
      athletePage.getByRole("heading", { name: "Plan / route simulation" }),
    ).toBeVisible();
    await expect(athletePage.getByRole("button", { name: "Start simulation" })).toBeEnabled();
    await athletePage.getByLabel(/Virtual speed assumption/).fill("36");
    await athletePage.getByRole("button", { name: "60×" }).click();
    await athletePage.getByRole("button", { name: "Start simulation" }).click();
    await expect(athletePage.getByRole("button", { name: "Pause simulation" })).toBeVisible();
    await expect
      .poll(async () =>
        Number((await athletePage.getByTestId("simulation-elapsed").innerText()).replace(" s", "")),
      )
      .toBeGreaterThan(0);
    await athletePage.getByRole("button", { name: "Pause simulation" }).click();
    await expect(athletePage.getByRole("button", { name: "Resume simulation" })).toBeVisible();
    await expect(athletePage.getByTestId("simulation-position")).toContainText(
      "Synthetic position",
    );
    await expect(athletePage.getByTestId("simulation-terrain")).toContainText("Unknown");
    await athletePage.getByRole("button", { name: "Resume simulation" }).click();
    await athletePage.getByRole("button", { name: "End simulation" }).click();
    await expect(athletePage.getByRole("status")).toContainText("Simulation ended by you");
    await expect(
      athletePage.getByRole("button", { name: /Save activity|Save review|Connect sensor/ }),
    ).toHaveCount(0);
    await athletePage.getByRole("button", { name: "Restart simulation" }).click();
    await expect(athletePage.getByTestId("simulation-elapsed")).toHaveText("0.0 s");
    expect(writes).toEqual([]);
    expect(
      await e2eDatabase.db
        .select()
        .from(activities)
        .where(eq(activities.profile_id, athleteActor.profileId)),
    ).toEqual(beforeActivities);
    expect(
      await e2eDatabase.db
        .select()
        .from(plannedSessions)
        .where(eq(plannedSessions.profile_id, athleteActor.profileId)),
    ).toEqual(beforeSessions);
  } finally {
    athletePage.off("request", watch);
    await testInfo.attach("simulation-write-check", {
      body: JSON.stringify(writes),
      contentType: "application/json",
    });
    await routes.openDetail(routeId);
    await routes.deleteFromDetail();
  }
});
