import { createHash } from "node:crypto";
import { Pool, type PoolClient } from "pg";

import { expect, test } from "../fixtures";
import { TEST_USERS } from "../utils/testData";

function localDatabaseUrl() {
  const value =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("Public-share E2E fixtures only support the local database.");
  }
  return value;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  }
  throw new Error(`Fixture contains unsupported ${typeof value}.`);
}

function structureHash(structure: unknown) {
  return `v1:sha256:${createHash("sha256").update(canonicalJson(structure)).digest("hex")}`;
}

function deterministicUuid(value: string) {
  const digest = createHash("sha256").update(value).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

async function athleteProfileId(client: PoolClient) {
  const result = await client.query<{ id: string }>(
    `select p."id" from "profiles" p
     inner join "users" u on u."id" = p."id"
     where lower(u."email") = lower($1) limit 1`,
    [TEST_USERS.athlete.email],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("The local athlete fixture was not provisioned.");
  return id;
}

async function withPublicShareFixture(
  testInfo: { project: { name: string }; titlePath: string[] },
  run: (fixture: {
    activityPlanId: string;
    trainingPlanId: string;
    trainingPlanName: string;
  }) => Promise<void>,
) {
  const identity = `${testInfo.project.name}|${testInfo.titlePath.join("|")}`;
  const activityPlanId = deterministicUuid(`${identity}|activity-plan`);
  const trainingPlanId = deterministicUuid(`${identity}|training-plan`);
  const trainingPlanName = `Playwright Public Share ${createHash("sha256").update(identity).digest("hex").slice(0, 12)}`;
  const activityStructure = {
    version: 3,
    activity_category: "bike",
    segments: [
      {
        id: deterministicUuid(`${identity}|segment`),
        role: "activity",
        name: "Tempo ride",
        intervals: [
          {
            id: deterministicUuid(`${identity}|interval`),
            name: "Main set",
            repetitions: 1,
            steps: [
              {
                id: deterministicUuid(`${identity}|step`),
                name: "Tempo",
                duration: { type: "time", seconds: 1_800 },
                targets: [{ type: "%FTP", intensity: 75 }],
              },
            ],
          },
        ],
      },
    ],
  };
  const trainingStructure = {
    version: 1,
    sessions: [
      {
        activity_plan_id: activityPlanId,
        offset_days: 0,
        event_overrides: { title: "Playwright tempo" },
      },
    ],
  };
  const pool = new Pool({ connectionString: localDatabaseUrl() });
  const client = await pool.connect();
  let transactionOpen = false;
  let testError: unknown;
  try {
    const profileId = await athleteProfileId(client);
    await client.query("begin");
    transactionOpen = true;
    await client.query(
      `insert into "activity_plans" (
        "id", "profile_id", "name", "description", "notes", "structure", "structure_hash",
        "gps_recording_enabled", "content_visibility", "is_system_template"
      ) values ($1, $2, 'Playwright Tempo Builder', 'A unique public-share browser fixture.', 'Bring bottles', $3::jsonb, $4, true, 'public', false)`,
      [
        activityPlanId,
        profileId,
        JSON.stringify(activityStructure),
        structureHash(activityStructure),
      ],
    );
    await client.query(
      `insert into "training_plans" (
        "id", "profile_id", "name", "description", "structure", "structure_hash",
        "content_visibility", "is_system_template"
      ) values ($1, $2, $3, 'A unique public-share browser fixture.', $4::jsonb, $5, 'public', false)`,
      [
        trainingPlanId,
        profileId,
        trainingPlanName,
        JSON.stringify(trainingStructure),
        structureHash(trainingStructure),
      ],
    );
    await client.query("commit");
    transactionOpen = false;
    await run({ activityPlanId, trainingPlanId, trainingPlanName });
  } catch (error) {
    testError = error;
  } finally {
    if (transactionOpen) await client.query("rollback").catch(() => undefined);
  }

  let cleanupError: unknown;
  try {
    await client.query("begin");
    await client.query('delete from "training_plans" where "id" = $1', [trainingPlanId]);
    await client.query('delete from "activity_plans" where "id" = $1', [activityPlanId]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    cleanupError = error;
  } finally {
    client.release();
    await pool.end();
  }
  if (testError) throw testError;
  if (cleanupError) throw cleanupError;
}

test("public activity-plan and training-plan links render anonymous readers", async ({
  page,
  athletePage,
}, testInfo) => {
  await withPublicShareFixture(testInfo, async ({ activityPlanId, trainingPlanName }) => {
    await page.goto(`/share/activity-plans/${activityPlanId}`);
    await expect(page.getByRole("heading", { name: "Playwright Tempo Builder" })).toBeVisible();
    await expect(page.getByText("Activity plan overview")).toBeVisible();
    await expect(page.getByText("Activity structure")).toBeVisible();

    await athletePage.goto("/training-plans");
    await athletePage
      .getByRole("searchbox", { name: /search training plans/i })
      .fill(trainingPlanName);
    const template = athletePage.getByText(trainingPlanName, { exact: true }).first();
    await expect(template).toBeVisible();
    await template.click();
    const trainingPlanId = athletePage.url().match(/\/training-plans\/([0-9a-f-]+)/)?.[1];
    if (!trainingPlanId) throw new Error("Training-plan fixture did not expose a UUID URL");

    await page.goto(`/share/training-plans/${trainingPlanId}`);
    await expect(page.getByRole("heading", { name: trainingPlanName })).toBeVisible();
    await expect(page.getByText("Plan overview")).toBeVisible();
  });
});
