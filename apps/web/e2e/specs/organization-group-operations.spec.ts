import { organizationGroups } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { withLocalE2EDatabase } from "../support/database";
import { waitForAppHydration } from "../support/hydration";

test.beforeEach(() => {
  expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1");
});

test("administrator creates an immutable organization group and confirms archival", async ({
  athletePage,
  e2eIdentity,
}) => {
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Group workflow");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`group-${e2eIdentity.uuid("organization")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  await expect(athletePage).toHaveURL(/\/organizations\/[0-9a-f-]{36}\/dashboard$/);
  await athletePage.getByRole("link", { name: "Manage organization groups", exact: true }).click();
  await expect(
    athletePage.getByRole("heading", { name: "Organization groups", exact: true }),
  ).toBeVisible();
  const name = `Training group ${e2eIdentity.uuid("group")}`;
  await athletePage.getByLabel("Name", { exact: true }).fill(name);
  await athletePage.getByLabel("Description", { exact: false }).fill("Immutable group description");
  await athletePage.getByRole("button", { name: "Create group", exact: true }).click();
  const groupLink = athletePage
    .getByRole("list", { name: "Organization groups" })
    .getByRole("link", { name: new RegExp(name) });
  await expect(groupLink).toBeVisible();
  await groupLink.click();
  await expect(athletePage.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(athletePage.getByRole("button", { name: "Create group", exact: true })).toHaveCount(
    0,
  );
  const groupId = new URL(athletePage.url()).pathname.split("/").at(-1);
  if (!groupId) throw new Error("Missing group detail identity");
  await athletePage.reload();
  await waitForAppHydration(athletePage);
  await expect(athletePage.getByRole("heading", { name, exact: true })).toBeVisible();
  await athletePage.getByRole("button", { name: "Archive group", exact: true }).click();
  await athletePage.getByRole("button", { name: "Cancel", exact: true }).click();
  await withLocalE2EDatabase(async (database) => {
    const [row] = await database.db
      .select()
      .from(organizationGroups)
      .where(eq(organizationGroups.id, groupId));
    expect(row?.archived_at).toBeNull();
  });
  await athletePage.getByRole("button", { name: "Archive group", exact: true }).click();
  await athletePage.getByRole("button", { name: "Confirm archive", exact: true }).click();
  await expect(
    athletePage.getByRole("heading", { name: `${name} archived`, exact: true }),
  ).toBeVisible();
  await withLocalE2EDatabase(async (database) => {
    const [row] = await database.db
      .select()
      .from(organizationGroups)
      .where(eq(organizationGroups.id, groupId));
    expect(row?.archived_at).toBeInstanceOf(Date);
    expect(row?.name).toBe(name);
  });
  await athletePage.getByRole("link", { name: "Back to groups", exact: true }).click();
  await expect(
    athletePage.getByText("No active organization groups yet.", { exact: true }),
  ).toBeVisible();
  await athletePage.reload();
  await expect(
    athletePage.getByText("No active organization groups yet.", { exact: true }),
  ).toBeVisible();
});
