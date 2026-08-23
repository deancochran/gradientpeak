import { expect, test } from "../fixtures";

test("onboarding.select-people-and-groups lets a user follow people and groups", async ({
  onboardingPage,
}) => {
  await onboardingPage.goto("/onboarding");

  await expect(onboardingPage.getByRole("heading", { name: "Groups and people" })).toBeVisible();
});
