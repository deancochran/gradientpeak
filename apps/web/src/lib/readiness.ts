type ReadinessCheckStatus = "ok" | "skipped" | "error";
type ReadinessStatus = "ok" | "degraded";

const DB_CHECK_TIMEOUT_MS = 1_500;

function hasDatabaseConfig() {
  return Boolean(process.env.DATABASE_URL ?? process.env.POSTGRES_URL);
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("Readiness check timed out"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function checkDatabase(): Promise<{
  status: ReadinessCheckStatus;
  configured: boolean;
  durationMs?: number;
}> {
  const configured = hasDatabaseConfig();
  const startedAt = Date.now();

  if (!configured) {
    return {
      status: isProductionRuntime() ? "error" : "skipped",
      configured,
    };
  }

  try {
    const { pool } = await import("@repo/db/client");
    await withTimeout(pool.query("select 1"), DB_CHECK_TIMEOUT_MS);

    return {
      status: "ok",
      configured,
      durationMs: Date.now() - startedAt,
    };
  } catch {
    return {
      status: "error",
      configured,
      durationMs: Date.now() - startedAt,
    };
  }
}

export async function buildReadinessResponse() {
  const database = await checkDatabase();
  const status: ReadinessStatus = database.status === "error" ? "degraded" : "ok";

  return {
    body: {
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      checks: {
        app: { status: "ok" as const },
        database,
      },
    },
    httpStatus: status === "ok" ? 200 : 503,
  };
}
