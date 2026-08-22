import { expect, test } from "../fixtures";
import {
  cleanupOwnedActivityPlans,
  e2eArtifactIdentity,
  runWithE2ECleanup,
} from "../utils/testData";

test.describe("activity-plan authoring capabilities", () => {
  test("browse-and-inspect opens a plan structure", async ({ athletePage }) => {
    await athletePage.goto("/activity-plans");
    await athletePage.getByRole("button", { name: /playwright tempo builder/i }).click();
    await expect(athletePage).toHaveURL(/\/activity-plans\/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee$/);
    await expect(athletePage.getByTestId("activity-plan-structure")).toBeVisible();
    await expect(athletePage.getByText("Bring bottles")).toBeVisible();
  });

  test("create and edit basics persist through the current authoring flow", async ({
    athletePage,
  }, testInfo) => {
    const name = e2eArtifactIdentity(testInfo, "P1 authored activity plan");
    await runWithE2ECleanup(
      testInfo,
      () => cleanupOwnedActivityPlans({ planNames: [name, `${name} edited`] }),
      async () => {
        await athletePage.goto("/activity-plans");
        await athletePage.getByRole("button", { name: /create activity plan/i }).click();
        await athletePage.getByLabel("Plan name").fill(name);
        await athletePage.getByLabel("Description").fill("Capability boundary plan");
        await athletePage.getByRole("button", { name: /create plan/i }).click();
        await expect(athletePage.getByRole("heading", { name })).toBeVisible();
        await athletePage.getByRole("button", { name: /^edit$/i }).click();
        await athletePage.getByLabel("Plan name").fill(`${name} edited`);
        await athletePage.getByRole("button", { name: /save changes/i }).click();
        await expect(athletePage.getByRole("heading", { name: `${name} edited` })).toBeVisible();
      },
    );
  });

  test.fail(
    "import-content is not available through the current web boundary",
    async ({ athletePage }) => {
      await athletePage.goto("/activity-plans");
      await expect(athletePage.getByRole("button", { name: /import content/i })).toBeVisible();
    },
  );
});
