import { expect, test } from "../fixtures";
import { SettingsPage } from "../pages/profile-settings";

test("a revoked browser cookie reloads to login without protected SSR shell markup", async ({
  athleteActor,
}) => {
  // Sign out through the real protected UI. actor.storageState is an immutable
  // fixture snapshot, so the next context retains the formerly-valid cookie
  // while the server session has been revoked by the compliant form flow.
  const revokerContext = await athleteActor.createContext();
  const revokerPage = await revokerContext.newPage();
  try {
    await revokerPage.goto("/settings");
    await new SettingsPage(revokerPage).signOut();
  } finally {
    await revokerContext.close();
  }

  const context = await athleteActor.createContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    const response = await page.goto("/settings");
    expect(new URL(page.url()).pathname).toBe("/auth/login");
    expect(response?.ok()).toBe(true);
    // The root layout intentionally contains a CSS has-selector mentioning
    // this class. Assert the actual protected boundary is absent instead.
    await expect(page.locator(".gp-protected-shell")).toHaveCount(0);
    // Login documents must not retain this fixture viewer in serialized route
    // bootstrap/query scripts. Keep the assertion boolean; never emit HTML.
    const scriptTexts = await page.locator("script").allTextContents();
    expect(scriptTexts.some((text) => text.includes(athleteActor.email))).toBe(false);
  } finally {
    await context.close();
  }
});

test("an inactive tab fails closed when another tab signs out", async ({ athleteActor }) => {
  const context = await athleteActor.createContext();
  const firstPage = await context.newPage();
  const secondPage = await context.newPage();
  try {
    await Promise.all([firstPage.goto("/settings"), secondPage.goto("/settings")]);
    await expect(secondPage.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();

    await new SettingsPage(firstPage).signOut();
    await secondPage.bringToFront();
    // Headless engines do not consistently emit a DOM focus event for
    // bringToFront. Dispatch the same browser focus signal the provider uses
    // when a user returns to an inactive tab.
    await secondPage.evaluate(() => window.dispatchEvent(new FocusEvent("focus")));

    await expect(secondPage).toHaveURL(/\/auth\/login\?redirect=/);
    await expect(secondPage.getByRole("heading", { name: "Settings", exact: true })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("concurrent authenticated SSR documents remain viewer-isolated", async ({ multiActor }) => {
  const [athleteResponse, coachResponse] = await Promise.all([
    multiActor.athlete.request.get("/"),
    multiActor.coach.request.get("/"),
  ]);
  expect(athleteResponse.ok()).toBe(true);
  expect(coachResponse.ok()).toBe(true);

  const [athleteHtml, coachHtml] = await Promise.all([
    athleteResponse.text(),
    coachResponse.text(),
  ]);
  // Test fixture identities are intentionally distinct and do not contain
  // credentials. Do not inspect or attach any session cookie/header values.
  expect(athleteHtml).toContain(multiActor.athlete.email);
  expect(athleteHtml).not.toContain(multiActor.coach.email);
  expect(coachHtml).toContain(multiActor.coach.email);
  expect(coachHtml).not.toContain(multiActor.athlete.email);
});
