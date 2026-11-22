import { expect, test } from "../fixtures";
import { ActivityPlansPage } from "../pages";

test("activity-plan library filters survive detail navigation and explicit back", async ({
  athleteActor,
  athletePage,
}) => {
  const plans = new ActivityPlansPage(athletePage);
  await athletePage.goto("/activity-plans?activity_category=bike&q=Tempo+Builder");
  await expect(plans.searchInput()).toHaveValue("Tempo Builder");
  await expect(athletePage.getByRole("button", { name: "Cycling" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const planCard = plans.card(/playwright tempo builder/i);
  await expect(planCard).toBeVisible();
  await planCard.press("Enter");
  await expect(athletePage).toHaveURL(
    new RegExp(
      `/activity-plans/${athleteActor.activityPlanId}\\?activity_category=bike&q=Tempo\\+Builder$`,
    ),
  );

  await athletePage.goBack();
  await expect(athletePage).toHaveURL(/\/activity-plans\?activity_category=bike&q=Tempo\+Builder$/);
  await expect(plans.searchInput()).toHaveValue("Tempo Builder");

  await planCard.press("Enter");
  await athletePage.getByRole("button", { name: "Duplicate" }).click();
  await expect(
    athletePage.getByRole("heading", { name: /playwright tempo builder \(copy\)/i }),
  ).toBeVisible();
  await athletePage.getByRole("link", { name: "Back to activity plans" }).click();
  await expect(athletePage).toHaveURL(/\/activity-plans\?activity_category=bike&q=Tempo\+Builder$/);
  await expect(plans.searchInput()).toHaveValue("Tempo Builder");
});
