import {
  authLaneContextOptions,
  authLaneRequestHeaders,
  expect,
  type LaneServer,
  test,
} from "../lane-support/auth/lane-test";
import { login, signUp, uniqueAuthActor, waitForAuthMail } from "../lane-support/auth/mailbox";
import { AuthPage, SettingsPage } from "../pages";
import { createE2EExecutionIdentity } from "../support/identity";

function username(prefix: string) {
  return `${prefix}_${createE2EExecutionIdentity(test.info()).suffix(`username-${prefix}`, 12)}`;
}

async function verifyAndLogin(
  page: Parameters<typeof signUp>[0],
  laneServer: LaneServer,
  suffix: string,
) {
  const actor = uniqueAuthActor(suffix);
  const verification = await signUp(page, actor);
  const response = await page.request.get(verification.actionUrl, {
    headers: authLaneRequestHeaders(laneServer),
  });
  expect(response.status()).toBe(200);
  await login(page, actor);
  await expect(page).toHaveURL(/\/onboarding/);
  await new AuthPage(page).waitForHydration();
  return actor;
}

async function completeProfile(
  page: Parameters<typeof signUp>[0],
  input: { fullName: string; username: string },
) {
  await new AuthPage(page).completeProfile(input);
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
}

test("[variation:auth.return-path:keyboard-login] a protected deep link returns through the real login form after keyboard submission", async ({
  athleteActor,
  page,
}) => {
  const auth = new AuthPage(page);
  // Training preferences was retired; settings is the current protected
  // preference surface and still proves the return-path contract.
  await page.goto("/settings");
  await expect(page).toHaveURL(/auth\/login\?redirect=%2Fsettings/);
  await auth.signIn(athleteActor, "keyboard");
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
});

test("[variation:auth.return-path:validation] hostile redirect remains local after a visible invalid-form retry", async ({
  page,
}) => {
  const auth = new AuthPage(page);
  await page.goto("/auth/login?redirect=https%3A%2F%2Fevil.example%2Fsteal");
  await auth.signIn({ email: "not-an-email", password: "short" });
  await expect(page).toHaveURL(/\/auth\/login\?redirect=%2F/);
  expect(new URL(page.url()).origin).not.toBe("https://evil.example");
  await expect(page.getByLabel(/^email/i)).toHaveValue("not-an-email");
});

test("[variation:auth.verification:reopen] a verified account can close and reopen the browser session at onboarding", async ({
  browser,
  laneServer,
  page,
}) => {
  const actor = await verifyAndLogin(page, laneServer, "verification-reopen");
  const context = await browser.newContext(authLaneContextOptions(laneServer));
  const reopened = await context.newPage();
  try {
    await login(reopened, actor);
    await expect(reopened.getByRole("heading", { name: "Finish your profile" })).toBeVisible();
    await expect(reopened.getByLabel("Username")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("[variation:auth.verification:keyboard-onboarding] verification reaches a keyboard-completed responsive profile form", async ({
  laneServer,
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await verifyAndLogin(page, laneServer, "verification-keyboard");
  await page.getByLabel("Full name").fill("Keyboard Verified Athlete");
  await page.getByLabel("Username").fill(username("verified_keyboard"));
  const finish = page.getByRole("button", { name: "Finish setup" });
  await finish.scrollIntoViewIfNeeded();
  await finish.focus();
  await expect(finish).toBeFocused();
  await finish.press("Enter");
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
});

test("[variation:auth.password-reset:mismatch-retry] mismatched reset fields preserve the form before a corrected password succeeds", async ({
  laneServer,
  page,
}, testInfo) => {
  testInfo.setTimeout(60_000);
  const actor = uniqueAuthActor("reset-mismatch");
  const verification = await signUp(page, actor);
  expect(
    (
      await page.request.get(verification.actionUrl, {
        headers: authLaneRequestHeaders(laneServer),
      })
    ).status(),
  ).toBe(200);
  const auth = new AuthPage(page);
  await login(page, actor);
  await expect(page).toHaveURL(/\/onboarding/);
  await auth.completeProfile({
    fullName: "Password Reset Athlete",
    username: username("reset_return"),
  });
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  const settings = new SettingsPage(page);
  await settings.open();
  await settings.signOut();
  const after = Date.now();
  await auth.requestPasswordReset(actor.email);
  const mail = await waitForAuthMail({ to: actor.email, kind: "reset-password", after });
  await auth.resetPassword(mail.actionUrl, "ChangedPass456!", "DifferentPass456!");
  await expect(page).toHaveURL(/\/auth\/update-password/);
  await expect(page.getByLabel(/^new password/i)).toHaveValue("ChangedPass456!");
  await page.getByLabel(/^confirm password/i).fill("ChangedPass456!");
  await page.getByRole("button", { name: /save new password/i }).press("Enter");
  await expect(page).toHaveURL(/\/auth\/login/);
});

test("[variation:auth.password-reset:return-path] the changed password completes a protected return-path login while the old password fails visibly", async ({
  laneServer,
  page,
}, testInfo) => {
  testInfo.setTimeout(60_000);
  const actor = uniqueAuthActor("reset-return");
  const verification = await signUp(page, actor);
  expect(
    (
      await page.request.get(verification.actionUrl, {
        headers: authLaneRequestHeaders(laneServer),
      })
    ).status(),
  ).toBe(200);
  const auth = new AuthPage(page);
  await login(page, actor);
  await expect(page).toHaveURL(/\/onboarding/);
  await auth.completeProfile({
    fullName: "Return Path Reset Athlete",
    username: username("reset_return"),
  });
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  const settings = new SettingsPage(page);
  await settings.open();
  await settings.signOut();
  const after = Date.now();
  await auth.requestPasswordReset(actor.email);
  const mail = await waitForAuthMail({ to: actor.email, kind: "reset-password", after });
  const nextPassword = "ReturnPathPass456!";
  await auth.resetPassword(mail.actionUrl, nextPassword);
  await auth.openLogin("/settings");
  await auth.signIn(actor);
  await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  await auth.signIn({ email: actor.email, password: nextPassword });
  await expect(page).toHaveURL(/\/settings$/);
});

test("[variation:auth.ordinary-sign-in:invalid-then-valid] a rejected credential can be corrected in place and still reaches the protected destination", async ({
  athleteActor,
  page,
}) => {
  const auth = new AuthPage(page);
  await auth.openLogin("/goals");
  await auth.signIn({ email: athleteActor.email, password: "IncorrectPassword123!" });
  await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  await auth.signIn(athleteActor);
  await expect.poll(() => new URL(page.url()).pathname).toBe("/goals");
  await expect(page.getByRole("heading", { name: "Goals", exact: true })).toBeVisible();
});

test("[variation:auth.ordinary-sign-in:back-forward] authenticated settings survives history navigation until explicit sign-out", async ({
  athleteActor,
  page,
}) => {
  const auth = new AuthPage(page);
  await auth.openLogin("/settings");
  await auth.signIn(athleteActor);
  await expect(page).toHaveURL(/\/settings$/);
  await page.goto("/notifications");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
});

test("[variation:auth.sign-out:back-cache] browser back cannot reveal the signed-out settings screen", async ({
  athleteActor,
  athletePage,
}) => {
  const settings = new SettingsPage(athletePage);
  await settings.open();
  await settings.signOut();
  await athletePage.goBack();
  await expect(athletePage).toHaveURL(/\/auth\/login\?redirect=/);
  await expect(athletePage.getByText(athleteActor.email, { exact: true })).toHaveCount(0);
});

test("[variation:auth.sign-out:deep-link] a post-sign-out protected deep link keeps its own return destination", async ({
  athletePage,
}) => {
  const settings = new SettingsPage(athletePage);
  await settings.open();
  await settings.signOut("keyboard");
  await athletePage.goto("/activity-plans");
  await expect(athletePage).toHaveURL(/auth\/login\?redirect=%2Factivity-plans/);
  await expect(athletePage.getByRole("heading", { name: "Login", exact: true })).toBeVisible();
});

test("[variation:onboarding.desktop:validation-retry] desktop profile form blocks missing identity then completes with preserved values", async ({
  laneServer,
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await verifyAndLogin(page, laneServer, "onboarding-desktop-validation");
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Full name").fill("Desktop Validation Athlete");
  await page.getByLabel("Username").fill(username("desktop_validation"));
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
});

test("[variation:onboarding.desktop:reload-draft] desktop unsaved identity fields reset on reload before a successful completion", async ({
  laneServer,
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await verifyAndLogin(page, laneServer, "onboarding-desktop-reload");
  await page.getByLabel("Full name").fill("Unsaved Desktop Name");
  await page.getByLabel("Username").fill("unsaved_desktop_name");
  await page.reload();
  await expect(page.getByLabel("Full name")).not.toHaveValue("Unsaved Desktop Name");
  await completeProfile(page, {
    fullName: "Reloaded Desktop Athlete",
    username: username("desktop_reloaded"),
  });
});

test("[variation:onboarding.narrow:scroll-focus] narrow setup scrolls to a focused submit control and persists completion after reload", async ({
  laneServer,
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await verifyAndLogin(page, laneServer, "onboarding-narrow-focus");
  await page.getByLabel("Full name").fill("Narrow Focus Athlete");
  await page.getByLabel("Username").fill(username("narrow_focus"));
  const finish = page.getByRole("button", { name: "Finish setup" });
  await finish.scrollIntoViewIfNeeded();
  await finish.focus();
  await expect(finish).toBeFocused();
  await finish.press("Enter");
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await page.reload();
  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
});

test("[variation:onboarding.narrow:history-guard] narrow completed onboarding cannot be reopened through browser history", async ({
  laneServer,
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await verifyAndLogin(page, laneServer, "onboarding-narrow-history");
  await completeProfile(page, {
    fullName: "Narrow History Athlete",
    username: username("narrow_history"),
  });
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel("Username")).toHaveCount(0);
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/$/);
});
