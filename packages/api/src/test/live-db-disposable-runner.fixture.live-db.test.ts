import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const receiptPath = process.env.LIVE_DB_DISPOSABLE_RECEIPT_PATH;
const enabled = process.env.LIVE_DB_DISPOSABLE_RUNNER_FIXTURE === "1" && receiptPath !== undefined;

describe.runIf(enabled)("guarded disposable runner fixture", () => {
  it("receives one generated database URL for both database variables", () => {
    if (!receiptPath) throw new Error("runner fixture receipt path is required");
    const databaseUrl = process.env.DATABASE_URL;
    const postgresUrl = process.env.POSTGRES_URL;
    expect(databaseUrl).toMatch(/^postgresql:\/\/[^/]+\/gradientpeak_api_live_db_\d+_\d+$/);
    expect(postgresUrl).toBe(databaseUrl);
    writeFileSync(receiptPath, JSON.stringify({ databaseUrl, postgresUrl }));
    if (process.env.LIVE_DB_DISPOSABLE_FORCE_FAILURE === "1") {
      throw new Error("intentional disposable runner failure");
    }
  });
});
