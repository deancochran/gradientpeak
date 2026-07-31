import { expect } from "@playwright/test";
import {
  expiredVerificationUrl,
  login,
  signUp,
  uniqueAuthActor,
  waitForAuthMail,
} from "../lane-support/auth/mailbox";
import type { FutureJourneyExecutor, FutureJourneyExecutorContext } from "./types";

export const futureJourneyExecutorEntries = [
  ["auth.sign-up-verify", executeSignUpAndVerification],
  ["auth.password-recovery", executePasswordRecovery],
  ["messaging.mobile-viewport", executeMobileMessageComposer],
] as const satisfies readonly (readonly [string, FutureJourneyExecutor])[];

export const futureJourneyExecutorById = new Map<string, FutureJourneyExecutor>(
  futureJourneyExecutorEntries,
);

async function executeSignUpAndVerification({ page }: FutureJourneyExecutorContext) {
  const actor = uniqueAuthActor("future-red-verify");
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
  expect(replay.status()).toBeLessThan(500);

  await login(page, actor);
  await expect(page).toHaveURL(/\/onboarding/);
}

async function executePasswordRecovery({ baseURL, browser, page }: FutureJourneyExecutorContext) {
  if (!baseURL || !browser) {
    throw new Error("Password recovery requires the auth-lane browser and base URL.");
  }

  const actor = uniqueAuthActor("future-red-recovery");
  const verification = await signUp(page, actor);
  await page.goto(verification.actionUrl);

  const secondContext = await browser.newContext({ baseURL });
  const secondSession = await secondContext.newPage();
  try {
    await login(page, actor);
    await login(secondSession, actor);

    const after = Date.now();
    await page.goto("/auth/forgot-password");
    await page.getByLabel(/^email/i).fill(actor.email);
    await page.getByRole("button", { name: /send reset email/i }).click();
    const resetMail = await waitForAuthMail({
      after,
      kind: "reset-password",
      to: actor.email,
    });

    // biome-ignore lint/security/noSecrets: Public disposable local E2E credential.
    const nextPassword = "FutureRedChangedPass456!";
    // biome-ignore lint/security/noSecrets: Public disposable local E2E credential.
    const replayPassword = "FutureRedReplayPass789!";
    await page.goto(resetMail.actionUrl);
    await page.getByLabel(/^new password/i).fill(nextPassword);
    await page.getByLabel(/^confirm password/i).fill(nextPassword);
    await page.getByRole("button", { name: /save new password/i }).click();
    await expect(page).toHaveURL(/\/auth\/login/);

    await secondSession.goto("/settings");
    await expect(secondSession).toHaveURL(/\/auth\/login\?redirect=/);

    await login(page, actor);
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();

    await login(page, { ...actor, password: nextPassword });
    await expect(page).toHaveURL(/\/onboarding/);

    await page.goto(resetMail.actionUrl);
    await page.getByLabel(/^new password/i).fill(replayPassword);
    await page.getByLabel(/^confirm password/i).fill(replayPassword);
    await page.getByRole("button", { name: /save new password/i }).click();
    await expect(page.getByText(/invalid|expired|used/i)).toBeVisible();
  } finally {
    await secondContext.close();
  }
}

async function executeMobileMessageComposer({ page }: FutureJourneyExecutorContext) {
  await expect(page.getByRole("heading", { name: /^messages$/i })).toBeVisible();
  await page.getByRole("link", { name: /^new message$/i }).click();
  await expect(page).toHaveURL(/\/messages\?compose=true/);
  await expect(page.getByRole("heading", { name: /new message/i })).toBeVisible();
  await expect(page.getByRole("searchbox")).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await page.goBack();
  await expect(page).toHaveURL(/\/messages\?compose=false/);
  await expect(page.getByRole("link", { name: /^new message$/i })).toBeVisible();
}
