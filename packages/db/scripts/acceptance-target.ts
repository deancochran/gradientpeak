import { execFileSync } from "node:child_process";

import { Pool } from "pg";

const targetIdPattern = /^[a-f0-9]{16}$/;

export type FreshAcceptanceTarget = {
  databaseName: string;
  databaseUrl: string;
  databasePort: string;
  targetId: string;
};

export type DockerContainerInspection = {
  HostConfig?: { Tmpfs?: Record<string, string> };
  Mounts?: Array<{ Type?: string; Destination?: string }>;
  Config?: { Labels?: Record<string, string> };
  NetworkSettings?: {
    Ports?: Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>;
  };
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
    parsedUrl.port === "54322" ||
    parsedUrl.search !== "" ||
    decodeURIComponent(parsedUrl.pathname) !== `/${databaseName}`
  ) {
    fail("DATABASE_URL must address the generated disposable database over 127.0.0.1.");
  }

  return { databaseName, databaseUrl, databasePort: parsedUrl.port, targetId };
}

export function assertFreshContainerIdentity(
  target: FreshAcceptanceTarget,
  inspection: DockerContainerInspection,
) {
  const labels = inspection.Config?.Labels;
  if (
    labels?.["com.gradientpeak.disposable"] !== "true" ||
    labels["com.gradientpeak.target-id"] !== target.targetId
  ) {
    fail(
      `container gradientpeak_db_fresh_${target.targetId} does not carry the required disposable labels.`,
    );
  }

  const postgresPort = inspection.NetworkSettings?.Ports?.["5432/tcp"];
  if (
    postgresPort?.length !== 1 ||
    postgresPort[0]?.HostIp !== "127.0.0.1" ||
    postgresPort[0]?.HostPort !== target.databasePort
  ) {
    fail("DATABASE_URL does not match the disposable container's 127.0.0.1:5432 host mapping.");
  }
}

export async function verifyFreshAcceptanceTarget(target: FreshAcceptanceTarget) {
  if (process.env.DB_ACCEPTANCE_CONTAINER_ID && process.env.GITHUB_ACTIONS !== "true") {
    fail("an explicit service container id is allowed only in GitHub Actions.");
  }
  const containerName =
    process.env.DB_ACCEPTANCE_CONTAINER_ID || `gradientpeak_db_fresh_${target.targetId}`;

  try {
    const output = execFileSync("docker", ["inspect", containerName], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const inspection = JSON.parse(output) as DockerContainerInspection[];
    if (inspection.length !== 1 || !inspection[0]) {
      fail(`could not read exactly one inspection result for ${containerName}.`);
    }
    assertFreshContainerIdentity(target, inspection[0]);
    if (!process.env.DB_ACCEPTANCE_CONTAINER_ID) {
      const container = inspection[0];
      if (
        !Object.hasOwn(container.HostConfig?.Tmpfs ?? {}, "/var/lib/postgresql/data") ||
        container.Mounts?.some((mount) => mount.Type !== "tmpfs")
      ) {
        fail("local acceptance requires tmpfs PGDATA and no persistent mounts.");
      }
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
