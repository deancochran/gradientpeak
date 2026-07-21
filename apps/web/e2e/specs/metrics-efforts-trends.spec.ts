import { expect, test } from "../fixtures";

test.skip(
  !process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY,
  "metrics, efforts, and trends E2E requires a service-role credential for the confirmed athlete fixture.",
);

test("athlete can manage dated profile history and record an atomic CSS test", async ({
  athletePage,
}) => {
  await athletePage.goto("/profile-metrics");
  await expect(athletePage.getByRole("heading", { name: "Profile metrics" })).toBeVisible();

  await athletePage.getByRole("button", { name: "30 days" }).click();
  await expect(athletePage.getByRole("button", { name: "30 days" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await athletePage.getByRole("button", { name: "Add measurement" }).click();
  await athletePage.getByLabel("Value (W)").fill("277");
  await athletePage.getByRole("button", { name: "Save", exact: true }).click();
  const createdMetricRow = athletePage.getByRole("row").filter({ hasText: "277 W" });
  await expect(createdMetricRow).toBeVisible();
  await createdMetricRow.click();
  await athletePage.getByLabel("Value (W)").fill("278");
  await athletePage.getByRole("button", { name: "Save", exact: true }).click();
  const updatedMetricRow = athletePage.getByRole("row").filter({ hasText: "278 W" });
  await expect(updatedMetricRow.getByText("Manual")).toBeVisible();
  await updatedMetricRow.getByRole("button", { name: "Delete" }).click();
  await athletePage.getByRole("button", { name: "Delete measurement" }).click();
  await expect(updatedMetricRow).toHaveCount(0);

  await athletePage.getByRole("button", { name: /critical swim speed/i }).click();
  await athletePage.getByRole("button", { name: /record 400m \/ 200m test/i }).click();
  await expect(athletePage.getByText(/saved together as one css test/i)).toBeVisible();
  await expect(athletePage.getByText(/records one validated css test.*atomically/i)).toBeVisible();
});

test("athlete can inspect effort evidence and full real trends analytics", async ({
  athletePage,
}) => {
  await athletePage.goto("/activity-efforts");
  await expect(athletePage.getByRole("heading", { name: "Activity efforts" })).toBeVisible();
  await athletePage.getByRole("button", { name: "All time" }).click();
  await expect(athletePage.getByRole("button", { name: "All time" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(athletePage.getByText(/modeled and review data are excluded/i)).toBeVisible();

  await athletePage.getByRole("button", { name: "Add effort" }).click();
  await athletePage.getByLabel("Power").fill("333");
  await athletePage.getByRole("button", { name: "Save effort" }).click();
  const effortRow = athletePage.getByRole("row").filter({ hasText: "333 W" });
  await expect(effortRow.getByText("observed")).toBeVisible();
  await expect(effortRow.getByText("manual_activity_effort_entry")).toBeVisible();
  await effortRow.getByRole("button", { name: "Delete" }).click();
  await athletePage.getByRole("button", { name: "Delete effort" }).click();
  await expect(effortRow).toHaveCount(0);

  await athletePage.goto("/trends");
  await expect(athletePage.getByRole("heading", { name: "Trends" })).toBeVisible();
  await expect(athletePage.getByText(/training load/i).first()).toBeVisible();
  await expect(athletePage.getByText(/consistency/i).first()).toBeVisible();
  await expect(athletePage.getByText(/intensity mix/i).first()).toBeVisible();
  await expect(athletePage.getByText(/peak power evidence/i)).toBeVisible();
});
