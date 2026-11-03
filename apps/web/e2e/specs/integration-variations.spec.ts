import { expect, test } from "../fixtures";
import { disconnectWahooIfConnected } from "../integrations/journey";
import { withTrpcFailure } from "../pages";

test.describe
  .serial("provider integration variations", () => {
    test("[variation:integrations.connect:cancel-disconnect] dismissing disconnect keeps the connected provider and sync action available", async ({
      athletePage,
    }) => {
      await athletePage.goto("/integrations");
      // The isolated provider project is the first route to exercise a fresh Vite dependency cache.
      await athletePage.reload();
      await disconnectWahooIfConnected(athletePage);
      await athletePage.getByRole("button", { name: "Connect" }).press("Enter");
      await expect(athletePage.getByText("Integration connected")).toBeVisible();
      athletePage.once("dialog", (dialog) => dialog.dismiss());
      await athletePage.getByRole("button", { name: "Disconnect" }).click();
      await expect(athletePage.getByRole("button", { name: "Disconnect" })).toBeVisible();
      await expect(athletePage.getByRole("button", { name: "Sync now" })).toBeVisible();
      await disconnectWahooIfConnected(athletePage);
    });

    test("[variation:integrations.connect:history] connected provider survives feature navigation and disconnect returns to connect state", async ({
      athletePage,
    }) => {
      await athletePage.goto("/integrations");
      await disconnectWahooIfConnected(athletePage);
      await athletePage.getByRole("button", { name: "Connect" }).click();
      await expect(athletePage.getByRole("button", { name: "Disconnect" })).toBeVisible();
      await athletePage.goto("/settings");
      await athletePage.goBack();
      await expect(athletePage.getByText("Wahoo", { exact: true })).toBeVisible();
      await expect(athletePage.getByRole("button", { name: "Disconnect" })).toBeVisible();
      athletePage.once("dialog", (dialog) => dialog.accept());
      await athletePage.getByRole("button", { name: "Disconnect" }).click();
      await expect(athletePage.getByRole("button", { name: "Connect" })).toBeVisible();
    });

    test("[variation:integrations.cached-status:keyboard-retry] cached Wahoo state remains visible while keyboard retry restores live status", async ({
      athletePage,
    }) => {
      await athletePage.goto("/integrations");
      await expect(athletePage.getByText("Wahoo", { exact: true })).toBeVisible();
      const refreshStatus = athletePage.getByRole("button", { name: "Refresh status" });
      await expect(refreshStatus).toBeEnabled();
      await withTrpcFailure(athletePage, "integrations.getSyncOverview", async () => {
        await refreshStatus.focus();
        await expect(refreshStatus).toBeFocused();
        await refreshStatus.press("Enter");
        await expect(athletePage.getByRole("alert")).toContainText("Showing the last known", {
          timeout: 15_000,
        });
        await expect(athletePage.getByText("Wahoo", { exact: true })).toBeVisible();
      });
      const retry = athletePage.getByRole("button", { name: "Retry" });
      await retry.focus();
      await retry.press("Enter");
      await expect(athletePage.getByRole("alert")).toHaveCount(0);
      await expect(athletePage.getByText("Wahoo", { exact: true })).toBeVisible();
    });

    test("[variation:integrations.cached-status:manual-recovery] stale status survives refresh failure and recovers without losing provider controls", async ({
      athletePage,
    }) => {
      await athletePage.goto("/integrations");
      const refreshStatus = athletePage.getByRole("button", { name: "Refresh status" });
      await expect(refreshStatus).toBeEnabled();
      await withTrpcFailure(athletePage, "integrations.getSyncOverview", async () => {
        await refreshStatus.click();
        await expect(athletePage.getByRole("alert")).toContainText("Showing the last known", {
          timeout: 15_000,
        });
        await expect(athletePage.getByText("Wahoo", { exact: true })).toBeVisible();
      });
      await athletePage.getByRole("button", { name: "Retry" }).click();
      await expect(athletePage.getByRole("alert")).toHaveCount(0);
      await expect(
        athletePage.getByRole("button", { name: /Connect|Disconnect|Sync now/ }).first(),
      ).toBeVisible();
    });
  });
