import { expect, type Page } from "@playwright/test";

export async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      { message: "The page should not extend past the viewport horizontally" },
    )
    .toBeLessThanOrEqual(0);
}

export async function expectAuthenticatedShell(page: Page) {
  await expect(page.getByRole("button", { name: /open user menu/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Login", exact: true })).toHaveCount(0);
}

export async function expectPublicPage(page: Page) {
  await expect(page.getByRole("button", { name: /open user menu/i })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: /primary navigation/i })).toHaveCount(0);
}

export async function expectNoOwnerControls(page: Page, controlNames: Array<string | RegExp>) {
  for (const name of controlNames) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }
}

export async function expectRouteQuery(
  page: Page,
  pathname: string | RegExp,
  query: Record<string, string>,
) {
  await expect(page).toHaveURL((url) => {
    const pathMatches =
      typeof pathname === "string" ? url.pathname === pathname : pathname.test(url.pathname);
    return (
      pathMatches &&
      Object.entries(query).every(([key, value]) => url.searchParams.get(key) === value)
    );
  });
}
