import { expect, test } from "../fixtures";

test("calendar.navigate-views preserves the requested month, week, and agenda views", async ({
  athletePage,
}) => {
  await athletePage.goto("/calendar?month=2026-10&date=2026-10-14&view=month");
  await expect(athletePage.getByRole("heading", { name: "Calendar" })).toBeVisible();
  await athletePage.getByRole("tab", { name: "Week" }).click();
  await expect(athletePage).toHaveURL(/view=week/);
  await athletePage.getByRole("button", { name: "Next calendar period" }).click();
  await expect(athletePage).toHaveURL(/date=2026-10-21/);
  await athletePage.getByRole("tab", { name: "Agenda" }).click();
  await expect(athletePage).toHaveURL(/view=agenda/);
  await expect(athletePage.getByRole("heading", { name: "Month agenda" })).toBeVisible();
});
