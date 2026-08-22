import { authLaneRequestHeaders, expect, test } from "../lane-support/auth/lane-test";
import { login, signUp, uniqueAuthActor } from "../lane-support/auth/mailbox";

// The lane Vite process must use its fixture-assigned port. PORT is reserved
// for Playwright's shared web server and otherwise overrides Vite's CLI port.
delete process.env.PORT;

test("sign out ends the current web session and returns to public access", async ({
  laneServer,
  page,
}) => {
  const actor = uniqueAuthActor("sign-out");
  const verification = await signUp(page, actor);
  const verificationResponse = await page.request.get(verification.actionUrl, {
    headers: authLaneRequestHeaders(laneServer),
  });
  expect(verificationResponse.status()).toBe(200);

  await login(page, actor);
  await expect(page.getByRole("heading", { name: "Finish your profile" })).toBeVisible();
  await page.getByRole("textbox", { name: "Full name" }).fill("Playwright Sign Out");
  await page
    .getByRole("textbox", { name: "Username" })
    .fill(`pw${Date.now().toString().slice(-10)}${process.pid % 1000}`);
  await page.getByRole("button", { name: "Finish setup", exact: true }).click();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign Out", exact: true }).click();

  await expect(page).toHaveURL(/\/auth\/login(?:\?.*)?$/);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/auth\/login(?:\?.*)?$/);
});
