import { expect, test } from "../lane-support/auth/lane-test";
import {
  authLaneRequestHeaders,
  login,
  signUp,
  uniqueAuthActor,
} from "../lane-support/auth/mailbox";

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
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign Out", exact: true }).click();

  await expect(page).toHaveURL(/\/auth\/login\?redirect=/);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/auth\/login\?redirect=/);
});
