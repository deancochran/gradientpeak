import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { expect, test } from "../fixtures";
import { TEST_USERS } from "../utils/testData";

function localDatabaseUrl() {
  const value =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("Coaching E2E fixtures only support the local database.");
  }
  return value;
}

async function seedCoachOrganization() {
  const pool = new Pool({ connectionString: localDatabaseUrl(), max: 1 });
  const organizationId = randomUUID();
  const membershipId = randomUUID();
  const organizationName = `Playwright Coaching ${organizationId}`;

  try {
    const profile = await pool.query<{ id: string }>(
      `select p."id"
       from "profiles" p
       inner join "users" u on u."id" = p."id"
       where lower(u."email") = lower($1)
       limit 1`,
      [TEST_USERS.coach.email],
    );
    const coachId = profile.rows[0]?.id;
    if (!coachId) throw new Error("The coach E2E profile is missing.");

    await pool.query("begin");
    await pool.query("set constraints all deferred");
    await pool.query(
      `insert into "organizations"
        ("id", "created_by_profile_id", "root_owner_membership_id", "name", "slug", "timezone")
       values ($1, $2, $3, $4, $5, 'UTC')`,
      [organizationId, coachId, membershipId, organizationName, `playwright-${organizationId}`],
    );
    await pool.query(
      `insert into "organization_memberships" ("id", "organization_id", "profile_id")
       values ($1, $2, $3)`,
      [membershipId, organizationId, coachId],
    );
    await pool.query(
      `insert into "organization_membership_role_grants"
        ("organization_id", "membership_id", "role_key")
       values ($1, $2, 'coach')`,
      [organizationId, membershipId],
    );
    await pool.query("commit");
  } catch (error) {
    await pool.query("rollback").catch(() => undefined);
    await pool.end();
    throw error;
  }

  await pool.end();
  return {
    organizationId,
    organizationName,
    cleanup: async () => {
      const cleanupPool = new Pool({ connectionString: localDatabaseUrl(), max: 1 });
      try {
        await cleanupPool.query("begin");
        await cleanupPool.query("set constraints all deferred");
        await cleanupPool.query(
          `delete from "organization_membership_role_grants"
           where "organization_id" = $1`,
          [organizationId],
        );
        await cleanupPool.query(
          `delete from "organization_memberships"
           where "organization_id" = $1 and "id" = $2`,
          [organizationId, membershipId],
        );
        await cleanupPool.query(`delete from "organizations" where "id" = $1`, [organizationId]);
        await cleanupPool.query("commit");
      } catch (error) {
        await cleanupPool.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        await cleanupPool.end();
      }
    },
  };
}

test("settings.select-theme persists a chosen theme across reloads", async ({ athletePage }) => {
  await athletePage.goto("/settings");

  const themePreference = athletePage.getByRole("group", { name: "Theme preference" });
  await themePreference.getByRole("button", { name: "dark" }).click();
  await expect(themePreference.getByRole("button", { name: "dark" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(() => athletePage.evaluate(() => localStorage.getItem("gradientpeak-theme-store")))
    .toBe("dark");

  await athletePage.reload();
  await expect(
    athletePage.getByRole("group", { name: "Theme preference" }).getByRole("button", {
      name: "dark",
    }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("coaching.protected-entry opens the coaching workspace entry", async ({ athletePage }) => {
  await athletePage.goto("/organizations");

  await expect(athletePage.getByRole("heading", { name: "Coaching organizations" })).toBeVisible();
  await expect(
    athletePage.getByRole("heading", { name: "No coaching organizations" }),
  ).toBeVisible();
  await expect(athletePage.getByRole("link", { name: "Standard app" })).toBeVisible();
});

test("coaching.view-dashboard opens an authorized organization dashboard", async ({
  coachPage,
}) => {
  const organization = await seedCoachOrganization();

  try {
    await coachPage.goto("/organizations");
    await coachPage
      .getByRole("link", { name: `Open ${organization.organizationName} coaching dashboard` })
      .click();

    await expect(coachPage).toHaveURL(
      new RegExp(`/organizations/${organization.organizationId}/dashboard$`),
    );
    await expect(coachPage.getByRole("heading", { name: "Coaching workspace" })).toBeVisible();
    await expect(
      coachPage.getByRole("region", { name: "Coaching dashboard readiness" }),
    ).toBeVisible();
    await expect(coachPage.getByRole("heading", { name: "Profiles" })).toBeVisible();
  } finally {
    await organization.cleanup();
  }
});
