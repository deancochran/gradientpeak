import { expect, test } from "../lane-support/auth/lane-test";
import {
  expiredVerificationUrl,
  login,
  signUp,
  uniqueAuthActor,
  waitForAuthMail,
} from "../lane-support/auth/mailbox";

test("sign-up verification rejects expiry and replay while preserving responsive onboarding", async ({
  page,
}) => {
  const actor = uniqueAuthActor("verify");
  const mail = await signUp(page, actor);
  await expect(page).toHaveURL(/\/auth\/sign-up-success/);

  const expired = await page.request.get(expiredVerificationUrl(mail.actionUrl), {
    maxRedirects: 0,
  });
  expect(expired.status()).toBe(302);
  expect(expired.headers().location).toContain("TOKEN_EXPIRED");

  await page.goto(mail.actionUrl);
  await expect(page).toHaveURL(/\/auth\/verification-success/);

  const replay = await page.request.get(mail.actionUrl, { maxRedirects: 0 });
  expect(replay.status()).toBeGreaterThanOrEqual(400);

  await login(page, actor);
  await expect(page).toHaveURL(/\/onboarding/);
  const viewport = page.viewportSize();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  expect(viewport?.width).toBeGreaterThan(0);
});

test("real password reset changes the credential and revokes a second session", async ({
  browser,
  page,
}) => {
  const actor = uniqueAuthActor("recovery");
  const verification = await signUp(page, actor);
  await page.goto(verification.actionUrl);

  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const firstSession = await firstContext.newPage();
  const secondSession = await secondContext.newPage();
  try {
    await login(firstSession, actor);
    await login(secondSession, actor);

    const after = Date.now();
    await firstSession.goto("/auth/forgot-password");
    await firstSession.getByLabel(/^email/i).fill(actor.email);
    await firstSession.getByRole("button", { name: /send reset email/i }).click();
    const resetMail = await waitForAuthMail({ to: actor.email, kind: "reset-password", after });

    const nextPassword = "ChangedPass456!";
    await firstSession.goto(resetMail.actionUrl);
    await firstSession.getByLabel(/^new password/i).fill(nextPassword);
    await firstSession.getByLabel(/^confirm password/i).fill(nextPassword);
    await firstSession.getByRole("button", { name: /save new password/i }).click();
    await expect(firstSession).toHaveURL(/\/auth\/login/);

    await secondSession.goto("/settings");
    await expect(secondSession).toHaveURL(/\/auth\/login\?redirect=/);

    await firstSession.goto("/auth/login");
    await firstSession.getByLabel(/^email/i).fill(actor.email);
    await firstSession.getByLabel(/^password/i).fill(actor.password);
    await firstSession.getByRole("button", { name: /^login$/i }).click();
    await expect(firstSession.getByText(/invalid email or password/i)).toBeVisible();

    await login(firstSession, { ...actor, password: nextPassword });
    await expect(firstSession).toHaveURL(/\/onboarding/);

    await firstSession.goto(resetMail.actionUrl);
    await firstSession.getByLabel(/^new password/i).fill("ReplayPass789!");
    await firstSession.getByLabel(/^confirm password/i).fill("ReplayPass789!");
    await firstSession.getByRole("button", { name: /save new password/i }).click();
    await expect(firstSession.getByText(/invalid|expired|used/i)).toBeVisible();
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
