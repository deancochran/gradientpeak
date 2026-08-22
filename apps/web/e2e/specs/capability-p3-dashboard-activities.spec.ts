import { expect, test } from "../fixtures";

test("home.view-dashboard shows current dashboard content", async ({ athletePage }) => {
  await expect(athletePage.getByRole("heading", { name: /welcome back/i })).toBeVisible();

  for (const title of ["Fitness", "Fatigue", "Form", "Consistency", "Active Plan"]) {
    await expect(athletePage.getByText(title, { exact: true })).toBeVisible();
  }

  await expect(
    athletePage.getByRole("heading", { name: "Upcoming Schedule", exact: true }),
  ).toBeVisible();
  await expect(
    athletePage.getByRole("heading", { name: "Current Focus", exact: true }),
  ).toBeVisible();
});
