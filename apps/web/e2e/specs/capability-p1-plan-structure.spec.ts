import { expect, test } from "../fixtures";

test("activity-plan.edit-structured-steps corrects an invalid structure before saving", async ({
  athletePage,
}) => {
  await athletePage.goto("/activity-plans");
  await athletePage.getByRole("button", { name: /create activity plan/i }).click();
  await athletePage.getByLabel("Plan name").fill("P1 structured step proof");

  await athletePage.getByRole("button", { name: "Delete segment" }).click();
  await expect(athletePage.getByRole("alert")).toContainText("Structure needs attention");
  await expect(athletePage.getByRole("button", { name: "Create plan" })).toBeDisabled();

  await athletePage.getByRole("button", { name: "Activity" }).click();
  await expect(athletePage.getByRole("button", { name: "Create plan" })).toBeEnabled();
});
