import { expect, test } from "../fixtures";
import { createOneOffEvent, createOpenGroup } from "../lane-support/groups/journeys";
import { cleanupOwnedGroups, e2eArtifactIdentity, runWithE2ECleanup } from "../utils/testData";

test.skip(
  !process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY,
  "group-event E2E requires a service-role credential to seed confirmed test users.",
);

test("owner creates, edits, RSVPs to, cancels an event, and archives its group", async ({
  athletePage,
}, testInfo) => {
  const groupName = e2eArtifactIdentity(testInfo, "group");
  const eventTitle = e2eArtifactIdentity(testInfo, "group event");

  await runWithE2ECleanup(
    testInfo,
    () => cleanupOwnedGroups([groupName]),
    async () => {
      await createOpenGroup(athletePage, groupName);

      await athletePage.getByRole("button", { name: "Edit group" }).click();
      await athletePage.getByLabel("Description").fill("Updated browser group description.");
      await athletePage.getByRole("button", { name: "Save changes" }).click();
      await expect(athletePage.getByText("Updated browser group description.")).toBeVisible();

      await createOneOffEvent(athletePage, eventTitle);
      await athletePage.getByRole("button", { name: "Going", exact: true }).click();
      await expect(athletePage.getByText(/Effective response: accepted/)).toBeVisible();

      await athletePage.getByRole("button", { name: "Edit event", exact: true }).click();
      await athletePage.getByLabel("Location").fill("Updated browser clubhouse");
      await athletePage.getByRole("button", { name: "Save changes" }).click();
      await expect(athletePage.getByText("Updated browser clubhouse")).toBeVisible();

      athletePage.once("dialog", (dialog) => dialog.accept());
      await athletePage.getByRole("button", { name: "Cancel event", exact: true }).click();
      await expect(athletePage.getByText("Cancelled")).toBeVisible();

      await athletePage.getByRole("button", { name: groupName }).click();
      athletePage.once("dialog", (dialog) => dialog.accept());
      await athletePage.getByRole("button", { name: "Archive group" }).click();
      await expect(athletePage).toHaveURL(/\/groups\/?$/);
    },
  );
});
