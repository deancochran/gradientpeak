import { expect, test } from "../fixtures";
import { createOneOffEvent, createOpenGroup } from "../lane-support/groups/journeys";
import { expectNoHorizontalOverflow } from "../pages";
import { waitForAppHydration } from "../support/hydration";
import { cleanupOwnedGroups, e2eArtifactIdentity, runWithE2ECleanup } from "../utils/testData";

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

test("event edit preserves overnight dates, invalid drafts, cancellation, and optional end clearing", async ({
  athletePage: page,
}, testInfo) => {
  const groupName = e2eArtifactIdentity(testInfo, "event continuity group");
  const eventTitle = e2eArtifactIdentity(testInfo, "overnight event");
  await runWithE2ECleanup(
    testInfo,
    () => cleanupOwnedGroups([groupName]),
    async () => {
      await createOpenGroup(page, groupName);
      await createOneOffEvent(page, eventTitle);
      const detailUrl = page.url();
      const openEdit = async () => {
        await waitForAppHydration(page);
        await page.getByRole("button", { name: "Edit event", exact: true }).click();
        await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(
          eventTitle,
        );
      };
      const starts = page.getByRole("textbox", { name: "Starts", exact: true });
      const ends = page.getByRole("textbox", { name: "Ends", exact: true });
      const save = page.getByRole("button", { name: "Save changes", exact: true });
      await openEdit();
      await starts.fill("2027-06-14T23:00");
      await ends.fill("2027-06-14T22:00");
      await save.click();
      await expect(page.locator("#group-event-schedule-error")).toContainText(
        "End time must be after start time",
      );
      await expect(starts).toHaveValue("2027-06-14T23:00");
      await expect(ends).toHaveValue("2027-06-14T22:00");
      await ends.fill("2027-06-15T01:00");
      await expectNoHorizontalOverflow(page);
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: testInfo.outputPath("overnight-event-edit.png"),
      });
      await save.click();
      await expect(page).toHaveURL(detailUrl);
      await page.reload();
      await openEdit();
      await expect(starts).toHaveValue("2027-06-14T23:00");
      await expect(ends).toHaveValue("2027-06-15T01:00");
      await page.getByRole("textbox", { name: "Title", exact: true }).fill("Discard this edit");
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(page).toHaveURL(detailUrl);
      await page.reload();
      await openEdit();
      await expect(ends).toHaveValue("2027-06-15T01:00");
      await ends.fill("");
      await save.click();
      await expect(page).toHaveURL(detailUrl);
      await page.reload();
      await openEdit();
      await expect(ends).toHaveValue("");
      await expect(starts).toHaveValue("2027-06-14T23:00");
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(page).toHaveURL(detailUrl);
    },
  );
});
