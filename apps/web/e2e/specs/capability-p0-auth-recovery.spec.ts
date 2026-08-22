import { expect, test } from "../fixtures";

test("sign out ends the current web session and returns to public access", async ({
  athletePage,
}) => {
  await athletePage.goto("/settings");
  await expect(athletePage.getByRole("heading", { name: /^settings$/i })).toBeVisible();
  await athletePage.getByRole("button", { name: "Sign Out", exact: true }).click();

  await expect(athletePage).toHaveURL(/\/auth\/login(?:\?.*)?$/);
  await athletePage.goto("/settings");
  await expect(athletePage).toHaveURL(/\/auth\/login\?redirect=%2Fsettings/);
});
