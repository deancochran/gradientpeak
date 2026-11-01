import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const launcher = fileURLToPath(new URL("./server-launcher.mjs", import.meta.url));

describe("acceptance server launcher", () => {
  it("does not pass poisoned parent credentials to the Vite child process", () => {
    const directory = mkdtempSync(join(tmpdir(), "gradientpeak-acceptance-launcher-"));
    const fakePnpm = join(directory, "pnpm");
    writeFileSync(
      fakePnpm,
      `#!/bin/sh
if [ -n "$AUTH_SMTP_PASS" ] || [ -n "$WAHOO_CLIENT_SECRET" ] || [ -n "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "poisoned credential reached Vite" >&2
  exit 23
fi
[ "$APP_URL" = "http://127.0.0.1:3100" ] || exit 24
[ "$NEXT_PRIVATE_SUPABASE_URL" = "http://127.0.0.1:54321" ] || exit 25
exit 0
`,
      "utf8",
    );
    chmodSync(fakePnpm, 0o755);

    try {
      const result = spawnSync(process.execPath, [launcher], {
        encoding: "utf8",
        env: {
          APP_URL: "http://127.0.0.1:3100",
          AUTH_EMAIL_MODE: "log",
          AUTH_SMTP_PASS: "poisoned-smtp-credential",
          BETTER_AUTH_SECRET: "synthetic-auth-secret",
          DATABASE_URL: "postgresql://postgres:fixture@127.0.0.1:65432/gradientpeak_fresh_test",
          HOME: directory,
          NEXT_PRIVATE_SUPABASE_SECRET_KEY: "synthetic-storage-secret",
          NEXT_PRIVATE_SUPABASE_URL: "http://127.0.0.1:54321",
          NODE_ENV: "development",
          PATH: directory,
          POSTGRES_URL: "postgresql://postgres:fixture@127.0.0.1:65432/gradientpeak_fresh_test",
          SUPABASE_SERVICE_ROLE_KEY: "poisoned-storage-credential",
          WAHOO_CLIENT_SECRET: "poisoned-provider-credential",
          WEB_ACCEPTANCE: "1",
        },
      });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
