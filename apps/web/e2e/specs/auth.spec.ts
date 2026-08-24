import {
  authLaneContextOptions,
  authLaneRequestHeaders,
  expect,
  test,
} from "../lane-support/auth/lane-test";
import {
  expiredVerificationUrl,
  login,
  signUp,
  uniqueAuthActor,
  waitForAuthMail,
} from "../lane-support/auth/mailbox";
import { AuthPage, expectNoHorizontalOverflow } from "../pages";
import { currentContractEpochHeaders } from "../utils/contractEpoch";

async function navigateThroughClientRedirect(page: Parameters<typeof login>[0], url: string) {
  try {
    await page.goto(url);
  } catch (error) {
    // Firefox reports a binding abort when TanStack Router replaces an SSR
    // redirect during navigation. The destination assertion remains required.
    if (
      !(error instanceof Error) ||
      !/(?:NS_BINDING_ABORTED|NS_ERROR_FAILURE|ERR_ABORTED)/.test(error.message)
    ) {
      throw error;
    }
  }
}

test("protected routes preserve a local return path and reject hostile login redirects", async ({
  page,
}) => {
  await navigateThroughClientRedirect(page, "/settings");
  await expect(page).toHaveURL(/\/auth\/login\?redirect=%2Fsettings/);

  await navigateThroughClientRedirect(
    page,
    "/auth/login?redirect=https%3A%2F%2Fevil.example%2Fcallback",
  );
  await expect(page).toHaveURL(/\/auth\/login\?redirect=%2F(?:settings)?$/);
  expect(new URL(page.url()).origin).not.toBe("https://evil.example");
});

test("sign-up verification rejects expiry and replay while preserving responsive onboarding", async ({
  laneServer,
  page,
}) => {
  const actor = uniqueAuthActor("verify");
  const mail = await signUp(page, actor);
  await expect(page).toHaveURL(/\/auth\/sign-up-success/);

  const expired = await page.request.get(expiredVerificationUrl(mail.actionUrl), {
    headers: authLaneRequestHeaders(laneServer),
    maxRedirects: 0,
  });
  expect(expired.status()).toBe(302);
  expect(expired.headers().location).toContain("TOKEN_EXPIRED");

  await page.goto(mail.actionUrl, { waitUntil: "commit" });
  await expect(page).toHaveURL(/\/auth\/verification-success/);

  const replay = await page.request.get(mail.actionUrl, {
    headers: authLaneRequestHeaders(laneServer),
    maxRedirects: 0,
  });
  expect(replay.status()).toBeGreaterThanOrEqual(400);

  await login(page, actor);
  await expect(page).toHaveURL(/\/onboarding/);
  const viewport = page.viewportSize();
  await expectNoHorizontalOverflow(page);
  expect(viewport?.width).toBeGreaterThan(0);
});

test("real password reset changes the credential and revokes a second session", async ({
  browser,
  laneServer,
  page,
}) => {
  const actor = uniqueAuthActor("recovery");
  const verification = await signUp(page, actor);
  const verificationResponse = await page.request.get(verification.actionUrl, {
    headers: authLaneRequestHeaders(laneServer),
  });
  expect(verificationResponse.status()).toBe(200);

  const contextOptions = authLaneContextOptions(laneServer, {
    viewport: { width: 1280, height: 720 },
  });
  const secondContext = await browser.newContext(contextOptions);
  const recoveryContext = await browser.newContext(contextOptions);
  let renewedContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  const secondSession = await secondContext.newPage();
  const recoveryPage = await recoveryContext.newPage();
  let primaryError: unknown;
  try {
    await login(page, actor);
    await expect(page).toHaveURL(/\/onboarding/);
    const secondLogin = await secondSession.request.post("/api/auth/sign-in/email", {
      data: actor,
      headers: authLaneRequestHeaders(laneServer, currentContractEpochHeaders),
    });
    expect(secondLogin.status()).toBe(200);
    expect((await secondContext.cookies()).some((cookie) => cookie.name.includes("session"))).toBe(
      true,
    );

    const after = Date.now();
    // Password recovery is public-only; use the original unauthenticated
    // context so the public route's authenticated-user guard cannot redirect it.
    const recoveryAuth = new AuthPage(recoveryPage);
    await recoveryAuth.requestPasswordReset(actor.email);
    const resetMail = await waitForAuthMail({ to: actor.email, kind: "reset-password", after });

    const nextPassword = "ChangedPass456!";
    await recoveryAuth.resetPassword(resetMail.actionUrl, nextPassword);
    await expect(recoveryPage).toHaveURL(/\/auth\/login/);

    await secondSession.goto("/settings");
    await expect(secondSession).toHaveURL(/\/auth\/login\?redirect=/);

    await page.goto("/settings");
    await expect(page).toHaveURL(/\/auth\/login\?redirect=/);

    await recoveryAuth.signIn(actor);
    await expect(recoveryPage.getByText(/invalid email or password/i)).toBeVisible();

    // The login form journey is covered above. Exercise the actual Better Auth
    // endpoint in a fresh browser context here so this assertion isolates the
    // changed credential from the form's navigation behavior.
    renewedContext = await browser.newContext(contextOptions);
    const renewedSession = await renewedContext.newPage();
    const renewedLogin = await renewedSession.request.post("/api/auth/sign-in/email", {
      data: { email: actor.email, password: nextPassword },
      headers: authLaneRequestHeaders(laneServer, currentContractEpochHeaders),
    });
    expect(renewedLogin.status()).toBe(200);
    expect((await renewedContext.cookies()).some((cookie) => cookie.name.includes("session"))).toBe(
      true,
    );
    await renewedSession.goto("/onboarding");
    await expect(renewedSession).toHaveURL(/\/onboarding/);

    const resetToken = new URL(resetMail.actionUrl).pathname.split("/").at(-1);
    expect(resetToken).toBeTruthy();
    const replay = await recoveryPage.request.post("/api/auth/reset-password", {
      data: { newPassword: "ReplayPass789!", token: resetToken },
      headers: authLaneRequestHeaders(laneServer, currentContractEpochHeaders),
    });
    expect(replay.status()).toBeGreaterThanOrEqual(400);
  } catch (error) {
    primaryError = error;
  }

  const cleanupErrors: unknown[] = [];
  for (const context of [secondContext, recoveryContext, renewedContext]) {
    if (!context) continue;
    try {
      await context.close();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (cleanupErrors.length > 0) {
    const errors = primaryError === undefined ? cleanupErrors : [primaryError, ...cleanupErrors];
    throw new AggregateError(errors, "Failed during auth test journey or context cleanup");
  }
  if (primaryError !== undefined) throw primaryError;
});
