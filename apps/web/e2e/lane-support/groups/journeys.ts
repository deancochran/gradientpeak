import { expect, type Page } from "@playwright/test";
import { Pool } from "pg";

function localDatabaseUrl() {
  const value =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    // biome-ignore lint/security/noSecrets: Supabase's documented local-only database URL.
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("Group E2E rate-limit cleanup is local-only.");
  }
  return value;
}

/** The shared actor reset predates the durable rate-limit window table. */
export async function resetLocalGroupE2ERateLimits() {
  const pool = new Pool({ connectionString: localDatabaseUrl() });
  try {
    await pool.query('delete from "api_rate_limit_windows"');
  } finally {
    await pool.end();
  }
}

export function uniqueGroupName(prefix = "Parity group") {
  return `${prefix} ${Date.now().toString(36)}`;
}

export async function createOpenGroup(page: Page, name: string) {
  await page.goto("/groups/new");
  await page.getByLabel("Name").fill(name);
  await page
    .getByLabel("Description")
    .fill("Browser-created group for group-event parity coverage.");
  await page.getByLabel("Access").selectOption("public");
  await page.getByLabel("Join policy").selectOption("open");
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page).toHaveURL(/\/groups\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

export async function createOneOffEvent(page: Page, title: string) {
  await page.getByRole("button", { name: "Create event" }).click();
  await page.getByLabel("Title").fill(title);
  const starts = new Date(Date.now() + 7 * 86_400_000);
  const ends = new Date(starts.getTime() + 3_600_000);
  const localValue = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };
  await page.getByRole("textbox", { name: "Starts", exact: true }).fill(localValue(starts));
  await page.getByRole("textbox", { name: "Ends", exact: true }).fill(localValue(ends));
  await page.getByRole("textbox", { name: "Location", exact: true }).fill("Browser clubhouse");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page).toHaveURL(/\/groups\/events\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}
