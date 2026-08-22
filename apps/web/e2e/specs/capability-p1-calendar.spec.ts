import { expect, test } from "../fixtures";

test("calendar.navigate-views preserves the requested month, week, and agenda views", async ({
  athletePage,
}) => {
  await athletePage.goto("/calendar?month=2026-10&date=2026-10-14&view=month");
  await expect(athletePage.getByRole("heading", { name: "Calendar" })).toBeVisible();
  await athletePage.goto("/calendar?month=2026-10&date=2026-10-14&view=week");
  await expect(athletePage).toHaveURL(/view=week/);
  await athletePage.goto("/calendar?month=2026-10&date=2026-10-21&view=week");
  await expect(athletePage).toHaveURL(/date=2026-10-21/);
  await athletePage.goto("/calendar?month=2026-10&date=2026-10-21&view=agenda");
  await expect(athletePage).toHaveURL(/view=agenda/);
  await expect(athletePage.getByRole("heading", { name: "Month agenda" })).toBeVisible();
});
