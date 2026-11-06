import { expect, test } from "../fixtures";

// The authenticated actor is a disposable, completed-onboarding fixture. The
// no-JS request is the regression oracle: protected SSR must already contain
// the authenticated shell and must not depend on Better Auth's client hook.
test("authenticated refresh retains the protected shell before client auth can run", async ({
  athleteActor,
}) => {
  const noJavaScriptContext = await athleteActor.createContext({ javaScriptEnabled: false });
  const noJavaScriptPage = await noJavaScriptContext.newPage();
  try {
    const response = await noJavaScriptPage.goto("/");
    expect(response?.ok()).toBe(true);
    await expect(noJavaScriptPage.getByRole("button", { name: "Open user menu" })).toBeVisible();
    await expect(noJavaScriptPage.getByText("Upcoming Schedule", { exact: true })).toBeVisible();
    await expect(noJavaScriptPage.getByText("Sign in", { exact: true })).toHaveCount(0);
  } finally {
    await noJavaScriptContext.close();
  }
});

test("blocked client session refresh does not replace the server-authenticated shell", async ({
  athleteActor,
}) => {
  const context = await athleteActor.createContext();
  const page = await context.newPage();
  try {
    await page.route("**/api/auth/get-session*", (route) => route.abort());
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole("button", { name: "Open user menu" })).toBeVisible();
    await expect(page.getByText("Upcoming Schedule", { exact: true })).toBeVisible();
    await expect(page.getByText("Sign in", { exact: true })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
