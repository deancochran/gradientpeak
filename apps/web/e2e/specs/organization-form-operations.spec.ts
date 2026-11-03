import { coachingEngagements } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";

// Organization membership/audit history is intentionally retained. Run this
// mutation journey only through the guarded disposable acceptance harness.
test.beforeEach(() => {
  expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1");
});

test("administrator reaches athlete roster and confirms a durable engagement termination", async ({
  athletePage,
  coachActor,
  e2eIdentity,
}) => {
  const slug = `roster-${e2eIdentity.uuid("roster-organization")}`;
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Roster workflow");
  await athletePage.getByLabel("Organization URL name", { exact: true }).fill(slug);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  const organizationId = new URL(athletePage.url()).pathname.split("/")[2];
  if (!organizationId) throw new Error("Created organization route identity is missing");
  const engagementId = e2eIdentity.uuid("roster-engagement");
  await withLocalE2EDatabase(async (database) => {
    await database.db.insert(coachingEngagements).values({
      id: engagementId,
      organization_id: organizationId,
      athlete_profile_id: coachActor.profileId,
    });
  });

  await athletePage.getByRole("link", { name: "Manage athletes", exact: true }).click();
  await expect(athletePage.getByRole("heading", { name: "Athlete roster" })).toBeVisible();
  await expect(
    athletePage.getByRole("list", { name: "Athletes", exact: true }).getByRole("listitem"),
  ).toHaveCount(1);
  await athletePage.getByRole("button", { name: "End engagement", exact: true }).click();
  await athletePage.getByRole("button", { name: "Confirm end engagement", exact: true }).click();
  await withLocalE2EDatabase(async (database) => {
    const [row] = await database.db
      .select()
      .from(coachingEngagements)
      .where(eq(coachingEngagements.id, engagementId));
    expect(row?.ended_at).toBeNull();
  });
  await athletePage.getByRole("checkbox", { name: /I understand that ending/ }).check();
  await athletePage.getByRole("button", { name: "Confirm end engagement", exact: true }).click();
  await expect(
    athletePage.getByRole("status").filter({ hasText: /engagement has ended/ }),
  ).toBeVisible();
  await withLocalE2EDatabase(async (database) => {
    const [row] = await database.db
      .select()
      .from(coachingEngagements)
      .where(eq(coachingEngagements.id, engagementId));
    expect(row?.ended_at).toBeInstanceOf(Date);
  });
  await athletePage.reload();
  await expect(
    athletePage.getByText("No athlete engagements are listed.", { exact: true }),
  ).toBeVisible();
});

test("organization creation reaches a persisted dashboard under the real hydrated form", async ({
  athletePage,
  e2eIdentity,
}) => {
  const organizationName = `Form workflow ${e2eIdentity.uuid("organization-create")}`;
  const slug = `form-${e2eIdentity.uuid("organization-slug")}`;
  const errors: string[] = [];
  athletePage.on("pageerror", (error) => errors.push(error.message));

  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill(organizationName);
  await athletePage.getByLabel("Organization URL name", { exact: true }).fill(slug);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();

  await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  await expect(athletePage.getByText(organizationName, { exact: true }).first()).toBeVisible();
  const dashboardUrl = athletePage.url();
  await athletePage.reload();
  await expect(athletePage).toHaveURL(dashboardUrl);
  await expect(athletePage.getByText(organizationName, { exact: true }).first()).toBeVisible();

  await athletePage.goto("/organizations");
  await expect(athletePage.getByText(organizationName, { exact: true })).toHaveCount(1);
  expect(errors).toEqual([]);
});
