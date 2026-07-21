import { expect, test } from "../fixtures";
import { disconnectWahooIfConnected } from "../integrations/journey";

test.skip(
  (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY) ||
    process.env.PROVIDER_OAUTH_TEST_ADAPTER !== "1",
  "integration E2E requires local test-user seeding and the explicit non-production OAuth adapter",
);

test.describe
  .serial("provider integrations", () => {
    test("local PKCE connect succeeds once, replay fails safely, and disconnect retains history", async ({
      athletePage,
    }) => {
      await athletePage.goto("/integrations");
      await expect(athletePage.getByRole("heading", { name: "Integrations" })).toBeVisible();
      await disconnectWahooIfConnected(athletePage);

      const callbackRequest = athletePage.waitForRequest((request) =>
        request.url().includes("/api/integrations/callback/wahoo"),
      );
      await athletePage.getByRole("button", { name: "Connect" }).click();
      const callbackUrl = (await callbackRequest).url();

      await expect(athletePage).toHaveURL(/\/integrations$/);
      await expect(athletePage.getByText("Integration connected")).toBeVisible();
      await expect(athletePage.getByRole("button", { name: "Disconnect" })).toBeVisible();
      expect(callbackUrl).toContain("code=");
      expect(callbackUrl).not.toContain("access_token");

      await athletePage.goto(callbackUrl);
      await expect(athletePage).toHaveURL(/\/integrations$/);
      await expect(athletePage.getByText("Integration connection failed")).toBeVisible();
      await expect(athletePage.getByRole("button", { name: "Disconnect" })).toBeVisible();

      const dialogPromise = athletePage.waitForEvent("dialog");
      await athletePage.getByRole("button", { name: "Disconnect" }).click();
      const dialog = await dialogPromise;
      expect(dialog.message()).toContain("Your GradientPeak data stays. Sync stops.");
      await dialog.accept();
      await expect(athletePage.getByRole("button", { name: "Connect" })).toBeVisible();
    });

    test("cached provider status survives a network error and recovers on retry", async ({
      athletePage,
    }) => {
      await athletePage.goto("/integrations");
      await expect(athletePage.getByText("Wahoo", { exact: true })).toBeVisible();

      await athletePage.route("**/api/trpc/integrations.getSyncOverview*", (route) =>
        route.abort(),
      );
      await athletePage.evaluate(() => {
        window.dispatchEvent(new Event("offline"));
        window.dispatchEvent(new Event("online"));
      });

      await expect(athletePage.getByRole("alert")).toContainText("Showing the last known");
      await expect(athletePage.getByText("Wahoo", { exact: true })).toBeVisible();

      await athletePage.unroute("**/api/trpc/integrations.getSyncOverview*");
      await athletePage.getByRole("button", { name: "Retry" }).click();
      await expect(athletePage.getByRole("alert")).toHaveCount(0);
      await expect(athletePage.getByText("Wahoo", { exact: true })).toBeVisible();
    });
  });
