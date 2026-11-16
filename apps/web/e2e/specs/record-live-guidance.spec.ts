import { recordingGuidanceFromTcx } from "@repo/core/recording/guidance";
import { activities } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import {
  TIMER_DRAFT_DATABASE_NAME,
  TIMER_DRAFT_DATABASE_VERSION,
} from "../../src/lib/recording/draft-storage";
import { deleteImportedActivity } from "../activities/fixture-files";
import { expect, test } from "../fixtures";
import { recordingSubmissionActivityId } from "../recording/indexed-db";

async function latestFinalizedTcx(page: Parameters<typeof recordingSubmissionActivityId>[0]) {
  return page.evaluate(
    async ({ name, version }) => {
      const request = indexedDB.open(name, version);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const transaction = database.transaction("finalized-artifacts", "readonly");
        const rows = await new Promise<Array<{ fileText?: string; finishedAt?: string }>>(
          (resolve, reject) => {
            const read = transaction.objectStore("finalized-artifacts").getAll();
            read.onsuccess = () => resolve(read.result);
            read.onerror = () => reject(read.error);
          },
        );
        return (
          rows.sort((left, right) =>
            (right.finishedAt ?? "").localeCompare(left.finishedAt ?? ""),
          )[0]?.fileText ?? null
        );
      } finally {
        database.close();
      }
    },
    { name: TIMER_DRAFT_DATABASE_NAME, version: TIMER_DRAFT_DATABASE_VERSION },
  );
}

test("[P0] free recording preserves live plan and route guidance through recovery and saved history", async ({
  athletePage,
  athleteActor,
  coachActor,
  e2eData,
  e2eDatabase,
}) => {
  const profileId = athleteActor.profileId;
  if (!profileId) throw new Error("An owned athlete profile is required");
  const publicPlan = await e2eData.activityPlans.create({
    actorEmail: coachActor.email,
    label: "live-guidance-public",
    visibility: "public",
  });
  const ownedPlan = await e2eData.activityPlans.create({
    actorEmail: athleteActor.email,
    label: "live-guidance-owned",
  });
  const firstRoute = await e2eData.routes.create({
    actorEmail: athleteActor.email,
    label: "live-guidance-first-route",
  });
  const secondRoute = await e2eData.routes.create({
    actorEmail: athleteActor.email,
    label: "live-guidance-second-route",
  });
  let activityId: string | null = null;
  let submissionError: string | null = null;
  athletePage.on("response", async (response) => {
    if (!response.url().includes("activities.createFromRecordingSummary")) return;
    const body = await response.json().catch(() => null);
    const results = Array.isArray(body) ? body : [body];
    for (const result of results) {
      const message = result?.error?.json?.message ?? result?.error?.message;
      if (typeof message === "string") submissionError = message;
    }
  });

  const attachPlan = async (name: string) => {
    await athletePage.getByRole("button", { name, exact: true }).click();
    await athletePage.getByRole("button", { name: "Attach / replace", exact: true }).click();
    await expect(athletePage.getByText(`Current plan: ${name}`, { exact: true })).toBeVisible();
    await expect(
      athletePage.getByText("Plan guidance attached and saved.", { exact: true }),
    ).toBeAttached();
  };

  try {
    await athletePage.goto("/record/session?activity_category=bike&gps=off");
    await athletePage.getByRole("button", { name: "Plan", exact: true }).click();
    await expect(
      athletePage.locator("details").filter({ hasText: "Plan & route setup" }),
    ).toHaveAttribute("open", "");
    await athletePage.getByRole("button", { name: "Start", exact: true }).click();
    await expect(athletePage.getByText("Recording", { exact: true })).toBeVisible();

    await attachPlan(publicPlan.name);
    await attachPlan(ownedPlan.name);
    const intensity = athletePage.getByRole("spinbutton", { name: "Intensity %", exact: true });
    await intensity.fill("90");
    await expect(intensity).toHaveValue("90");
    await athletePage.getByRole("button", { name: "Apply intensity", exact: true }).click();
    await expect(athletePage.getByText("Session intensity saved.", { exact: true })).toBeAttached();
    await expect
      .poll(async () =>
        athletePage.getByText("Elapsed", { exact: true }).locator("..").textContent(),
      )
      .not.toContain("00:00:00");
    await athletePage.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(athletePage.getByText("Paused", { exact: true })).toBeVisible();
    await athletePage.getByRole("button", { name: "Detach plan", exact: true }).click();
    await expect(athletePage.getByText("No plan guidance attached.")).toBeVisible();
    await expect(
      athletePage.getByText("Plan guidance detached and saved.", { exact: true }),
    ).toBeAttached();
    await attachPlan(ownedPlan.name);

    await athletePage.getByRole("button", { name: firstRoute.name, exact: true }).click();
    await expect(athletePage.getByText("Route guidance saved.", { exact: true })).toBeAttached();
    await athletePage.getByRole("button", { name: "No route", exact: true }).click();
    await expect(athletePage.getByText("Route guidance saved.", { exact: true })).toBeAttached();
    await athletePage.getByRole("button", { name: secondRoute.name, exact: true }).click();
    await expect(athletePage.getByText("Route guidance saved.", { exact: true })).toBeAttached();
    const elapsedBeforeReload = await athletePage
      .getByText("Elapsed", { exact: true })
      .locator("..")
      .textContent();
    expect(elapsedBeforeReload).not.toContain("00:00:00");

    await athletePage.reload();
    await expect(athletePage.getByText(/recovered safely in paused state/i)).toBeVisible();
    await expect(athletePage.getByText("Elapsed", { exact: true }).locator("..")).not.toContainText(
      "00:00:00",
    );
    await athletePage.getByRole("button", { name: "Resume", exact: true }).click();
    await athletePage.getByRole("button", { name: "Finish", exact: true }).click();
    await expect(athletePage.getByRole("heading", { name: "Review recording" })).toBeVisible();

    const tcx = await latestFinalizedTcx(athletePage);
    if (!tcx) throw new Error("Finished recording must retain its local TCX artifact.");
    const guidance = recordingGuidanceFromTcx(tcx);
    expect(guidance?.revisions.map((revision) => revision.kind)).toEqual([
      "initial",
      "plan",
      "plan",
      "intensity",
      "plan",
      "plan",
      "route",
      "route",
      "route",
    ]);
    expect(guidance?.revisions.map((revision) => revision.activeMs)).toEqual(
      [...(guidance?.revisions.map((revision) => revision.activeMs) ?? [])].sort((a, b) => a - b),
    );
    expect(guidance?.revisions.at(-1)?.routeId).toBe(secondRoute.id);

    await athletePage.getByRole("button", { name: "Save activity", exact: true }).click();
    const open = athletePage.getByRole("link", { name: "Open saved activity", exact: true });
    await expect
      .poll(async () => ((await open.isVisible()) ? "saved" : (submissionError ?? "pending")), {
        timeout: 20_000,
      })
      .toBe("saved");
    activityId = await recordingSubmissionActivityId(athletePage);
    if (!activityId) throw new Error("Saved recording must expose its durable activity identity.");
    e2eData.activities.register(activityId, profileId);
    await open.click();
    await expect(athletePage).toHaveURL(new RegExp(`/activities/${activityId}$`));
    expect(
      await e2eDatabase.db
        .select({ planId: activities.activity_plan_id, routeId: activities.route_id })
        .from(activities)
        .where(and(eq(activities.id, activityId), eq(activities.profile_id, profileId))),
    ).toEqual([{ planId: publicPlan.id, routeId: firstRoute.id }]);
  } finally {
    activityId ??= await recordingSubmissionActivityId(athletePage);
    if (activityId) {
      e2eData.activities.register(activityId, profileId);
      await deleteImportedActivity(athletePage, activityId);
    }
  }
});
