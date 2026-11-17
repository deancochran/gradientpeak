import { expect, test } from "../fixtures";
import { waitForAppHydration } from "../support/hydration";

test.skip(
  process.env.WAHOO_OAUTH_TEST_ADAPTER !== "1",
  "Wahoo connection acceptance requires the isolated local OAuth adapter",
);

test("Wahoo web Connect returns to the browser and retains its connection after reload", async ({
  athletePage: page,
}, testInfo) => {
  let attemptedExternalRequest = false;
  await page.context().route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
    attemptedExternalRequest = true;
    return route.abort();
  });

  await page.goto("/integrations");
  await waitForAppHydration(page);
  const wahoo = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText("Wahoo", { exact: true }) });
  await expect(wahoo).toHaveCount(1);
  const connect = wahoo.getByRole("button", { name: "Connect", exact: true });
  await expect(connect).toBeEnabled();

  const webOrigin = new URL(page.url()).origin;
  const authorizationRequest = page.waitForRequest((request) =>
    request.url().includes("integrations.getAuthUrl"),
  );
  const callbackRequest = page.waitForRequest((request) =>
    request.url().includes("/api/integrations/callback/wahoo"),
  );
  await connect.click();
  expect((await authorizationRequest).postDataJSON()).toEqual({
    "0": { json: { provider: "wahoo", redirectUri: `${webOrigin}/integrations` } },
  });
  const callback = new URL((await callbackRequest).url());
  expect(callback.origin).toBe(webOrigin);
  expect(callback.searchParams.has("code")).toBe(true);
  expect(callback.searchParams.has("access_token")).toBe(false);

  await waitForAppHydration(page);
  await expect(page.getByText("Integration connected", { exact: true })).toBeVisible();
  await expect(wahoo.getByRole("button", { name: "Disconnect", exact: true })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/integrations");
  expect(new URL(page.url()).searchParams.has("code")).toBe(false);

  await page.reload();
  await waitForAppHydration(page);
  await expect(wahoo.getByRole("button", { name: "Disconnect", exact: true })).toBeVisible();
  expect(attemptedExternalRequest).toBe(false);
  await wahoo.screenshot({ path: testInfo.outputPath("wahoo-web-connected.png") });
});
