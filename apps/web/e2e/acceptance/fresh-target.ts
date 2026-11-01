import { execFileSync } from "node:child_process";

import { Pool } from "pg";

const targetIdPattern = /^[a-f0-9]{16}$/;

export type FreshAcceptanceTarget = {
  databaseName: string;
  databaseUrl: string;
  targetId: string;
};

function fail(message: string): never {
  throw new Error(`[acceptance] refusing to run: ${message}`);
}

export function readFreshAcceptanceTarget(
  env: NodeJS.ProcessEnv = process.env,
): FreshAcceptanceTarget {
  if (env.DB_DISPOSABLE_TARGET !== "1") {
    fail("DB_DISPOSABLE_TARGET=1 is required.");
  }

  const targetId = env.DB_DISPOSABLE_TARGET_ID;
  if (!targetId || !targetIdPattern.test(targetId)) {
    fail("DB_DISPOSABLE_TARGET_ID must be the generated 16-character hexadecimal target id.");
  }

  const databaseName = `gradientpeak_fresh_${targetId}`;
  if (env.DB_DISPOSABLE_DATABASE !== databaseName) {
    fail(`DB_DISPOSABLE_DATABASE must equal ${databaseName}.`);
  }

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl || env.POSTGRES_URL !== databaseUrl) {
    fail("DATABASE_URL and POSTGRES_URL must both be present and exactly match.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    fail("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (
    !["postgres:", "postgresql:"].includes(parsedUrl.protocol) ||
    parsedUrl.hostname !== "127.0.0.1" ||
    !parsedUrl.port ||
    decodeURIComponent(parsedUrl.pathname) !== `/${databaseName}`
  ) {
    fail("DATABASE_URL must address the generated disposable database over 127.0.0.1.");
  }

  return { databaseName, databaseUrl, targetId };
}

export async function verifyFreshAcceptanceTarget(target: FreshAcceptanceTarget) {
  const containerName = `gradientpeak_db_fresh_${target.targetId}`;

  try {
    const labels = execFileSync(
      "docker",
      [
        "inspect",
        "--format",
        '{{index .Config.Labels "com.gradientpeak.disposable"}} {{index .Config.Labels "com.gradientpeak.target-id"}}',
        containerName,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    if (labels !== `true ${target.targetId}`) {
      fail(`container ${containerName} does not carry the required disposable labels.`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("[acceptance]")) throw error;
    fail(`could not verify the task-owned container ${containerName}.`);
  }

  const pool = new Pool({ connectionString: target.databaseUrl });
  try {
    const result = await pool.query<{ database_name: string }>(
      "select current_database() as database_name",
    );
    if (result.rows[0]?.database_name !== target.databaseName) {
      fail("the supplied URL is not connected to the generated disposable database.");
    }
  } finally {
    await pool.end();
  }
}
