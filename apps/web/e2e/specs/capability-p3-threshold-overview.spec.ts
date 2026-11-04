import { expect, test } from "../fixtures";

test("[P3] performance.threshold-overview opens the athlete's calculated threshold history", async ({
  athletePage,
}) => {
  await athletePage.goto("/");
  await expect(athletePage.getByRole("link", { name: "Manage thresholds" })).toBeVisible();

  await athletePage.getByRole("link", { name: "Manage thresholds" }).click();
  await expect(athletePage).toHaveURL(/\/thresholds\/?$/);
  await expect(athletePage.getByRole("heading", { name: "Thresholds" })).toBeVisible();
  await expect(athletePage.getByTestId("threshold-overview")).toBeVisible();
});
