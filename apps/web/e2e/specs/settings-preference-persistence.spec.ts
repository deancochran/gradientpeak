import { expect, test } from "../fixtures";

test("settings restores a keyboard-selected theme after a full reload", async ({
  athletePage,
}, testInfo) => {
  await athletePage.goto("/settings");

  const themePreference = athletePage.getByRole("group", { name: "Theme preference" });
  const darkTheme = themePreference.getByRole("button", { name: "dark" });
  await darkTheme.focus();
  await athletePage.keyboard.press("Enter");
  await expect(darkTheme).toHaveAttribute("aria-pressed", "true");

  await athletePage.reload({ waitUntil: "domcontentloaded" });
  await expect(
    athletePage
      .getByRole("group", { name: "Theme preference" })
      .getByRole("button", { name: "dark" }),
  ).toHaveAttribute("aria-pressed", "true");
  await athletePage.screenshot({
    path: testInfo.outputPath("settings-theme-dark-reloaded.png"),
  });
});

test("settings persists an explicit analytics opt-in after a denied-preference reload", async ({
  athletePage,
}, testInfo) => {
  await athletePage.goto("/settings");

  const consent = athletePage.getByRole("switch", { name: "Product analytics" });
  if (await consent.isChecked()) await consent.click();
  await expect(consent).not.toBeChecked();

  await athletePage.reload({ waitUntil: "domcontentloaded" });
  const reloadedConsent = athletePage.getByRole("switch", { name: "Product analytics" });
  await expect(reloadedConsent).not.toBeChecked();

  await reloadedConsent.click();
  await expect
    .poll(() =>
      athletePage.evaluate(() => localStorage.getItem("gradientpeak-product-analytics-consent")),
    )
    .toBe("granted");
  await expect(reloadedConsent).toBeChecked();

  await athletePage.reload({ waitUntil: "domcontentloaded" });
  await expect(athletePage.getByRole("switch", { name: "Product analytics" })).toBeChecked();
  await athletePage.screenshot({
    path: testInfo.outputPath("settings-analytics-opted-in-reloaded.png"),
  });
});
