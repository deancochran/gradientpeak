import { coachingEngagements, organizationGroupAthletes } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";
import { waitForAppHydration } from "../support/hydration";

test("administrator adds and ends a group athlete link without ending engagement", async ({
  athletePage,
  coachActor,
  e2eIdentity,
}) => {
  expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1");
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Group athlete workflow");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`links-${e2eIdentity.uuid("org")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId) throw new Error("Missing organization identity");
  const engagementId = e2eIdentity.uuid("engagement");
  await withLocalE2EDatabase(async ({ db }) => {
    await db.insert(coachingEngagements).values({
      id: engagementId,
      organization_id: organizationId,
      athlete_profile_id: coachActor.profileId,
    });
  });
  await athletePage.getByRole("link", { name: "Manage organization groups", exact: true }).click();
  await athletePage.getByLabel("Name", { exact: true }).fill("Athlete links group");
  await athletePage.getByRole("button", { name: "Create group", exact: true }).click();
  await athletePage
    .getByRole("list", { name: "Organization groups" })
    .getByRole("link", { name: /Athlete links group/ })
    .click();
  const groupId = new URL(athletePage.url()).pathname.split("/").at(-1);
  if (!groupId) throw new Error("Missing group identity");
  await athletePage.getByRole("link", { name: "Manage group athletes", exact: true }).click();
  await athletePage.getByLabel("Eligible athlete", { exact: true }).selectOption(engagementId);
  await athletePage.getByRole("button", { name: "Assign athlete", exact: true }).click();
  await expect(
    athletePage.getByRole("list", { name: "Assigned athletes", exact: true }).getByRole("listitem"),
  ).toHaveCount(1);
  await athletePage.reload();
  await waitForAppHydration(athletePage);
  await expect(
    athletePage.getByRole("list", { name: "Assigned athletes", exact: true }).getByRole("listitem"),
  ).toHaveCount(1);
  await athletePage.getByRole("button", { name: "Remove athlete", exact: true }).click();
  await athletePage.getByRole("button", { name: "Cancel", exact: true }).click();
  await athletePage.getByRole("button", { name: "Remove athlete", exact: true }).click();
  await athletePage.getByRole("button", { name: "Confirm removal", exact: true }).click();
  await expect(
    athletePage.getByRole("status").filter({ hasText: "was removed from this group" }),
  ).toBeVisible();
  await withLocalE2EDatabase(async ({ db }) => {
    const links = await db
      .select()
      .from(organizationGroupAthletes)
      .where(
        and(
          eq(organizationGroupAthletes.group_id, groupId),
          eq(organizationGroupAthletes.engagement_id, engagementId),
        ),
      );
    expect(links).toHaveLength(1);
    expect(links[0]?.ended_at).toBeInstanceOf(Date);
    const [engagement] = await db
      .select()
      .from(coachingEngagements)
      .where(eq(coachingEngagements.id, engagementId));
    expect(engagement?.ended_at).toBeNull();
  });
  await athletePage.reload();
  await waitForAppHydration(athletePage);
  await expect(
    athletePage.getByText("No athletes are assigned to this group.", { exact: true }),
  ).toBeVisible();
});
