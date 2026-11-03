import { expect, test } from "../fixtures";

// Organization membership/audit history is intentionally retained. Run this
// mutation journey only through the guarded disposable acceptance harness.
test.beforeEach(() => {
  expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1");
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
