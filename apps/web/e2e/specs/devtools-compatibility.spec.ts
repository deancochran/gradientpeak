import { expect, test } from "../fixtures";
import { ShellPage } from "../pages";

test("router devtools respects opt-in and follows route changes without browser errors", async ({
  athletePage,
}) => {
  const browserErrors: Error[] = [];
  athletePage.on("pageerror", (error) => browserErrors.push(error));
  await athletePage.addInitScript(() => {
    const runtime = globalThis as typeof globalThis & {
      __devtoolsUnhandledRejections?: string[];
    };
    runtime.__devtoolsUnhandledRejections = [];
    window.addEventListener("unhandledrejection", (event) => {
      runtime.__devtoolsUnhandledRejections?.push(
        event.reason instanceof Error ? event.reason.message : String(event.reason),
      );
    });
  });

  // Attach the listener before hydration so unhandled rejections from the
  // development-only devtools panel are observable to this regression test.
  await athletePage.reload();
  if (process.env.VITE_ENABLE_DEVTOOLS !== "true") {
    await expect(athletePage.locator('body > div[aria-busy="false"]')).toBeVisible();
    await expect(athletePage.getByRole("button", { name: "Open TanStack Devtools" })).toHaveCount(
      0,
    );
    await expect(athletePage.getByTestId("tanstack-devtools-panel")).toHaveCount(0);
    expect(browserErrors).toEqual([]);
    return;
  }
  await expect(athletePage.getByRole("button", { name: "Open TanStack Devtools" })).toBeVisible();

  await athletePage.getByRole("button", { name: "Open TanStack Devtools" }).click();
  await expect(athletePage.getByTestId("tanstack-devtools-panel")).toBeVisible();

  await athletePage.getByText("TanStack Router", { exact: true }).last().click();
  const routerPanel = athletePage.locator(".TanStackRouterDevtoolsPanel");
  await expect(routerPanel).toBeVisible();
  await routerPanel.getByRole("button", { name: "Matches", exact: true }).click();

  await new ShellPage(athletePage).open("/calendar");
  await expect(athletePage).toHaveURL(/\/calendar(?:\?|$)/);
  await expect(routerPanel).toContainText("/calendar");
  await expect.poll(() => browserErrors.map((error) => error.message)).toEqual([]);
  await expect
    .poll(() =>
      athletePage.evaluate(() => {
        const runtime = globalThis as typeof globalThis & {
          __devtoolsUnhandledRejections?: string[];
        };
        return runtime.__devtoolsUnhandledRejections ?? [];
      }),
    )
    .toEqual([]);
});
