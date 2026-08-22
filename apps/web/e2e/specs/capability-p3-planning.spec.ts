import { expect, test } from "../fixtures";

test("planning.inspect-ledger lets an athlete inspect the planning ledger", async ({
  athletePage,
}) => {
  await athletePage.goto("/plan");

  await expect(athletePage.getByRole("heading", { name: /planning ledger/i })).toBeVisible();
});
