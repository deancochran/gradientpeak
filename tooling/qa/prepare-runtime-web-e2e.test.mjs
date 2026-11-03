import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  deriveRuntimeWebE2EEnvironment,
  formatGitHubMaskCommand,
  prepareRuntimeWebE2E,
} from "./prepare-runtime-web-e2e.mjs";

const serviceKey = "local-service-key-never-log";

test("browser CI starts and stops the same guarded E2E target", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
  const browser = workflow.split("  runtime-web:")[1]?.split("  ci:")[0];
  assert.ok(browser);
  assert.match(browser, /run: pnpm db:e2e:start/);
  assert.match(browser, /if: always\(\)\s+run: pnpm db:e2e:stop/);
  assert.doesNotMatch(browser, /self-host:down/);
});

function inspection(name, ports = {}, environment = []) {
  return {
    Name: `/${name}`,
    Config: {
      Env: environment,
      Labels: {
        "com.docker.compose.project": "gradientpeak_e2e",
        "com.supabase.cli.project": "gradientpeak_e2e",
      },
    },
    NetworkSettings: { Ports: ports },
  };
}

function guardedStack() {
  return [
    inspection(
      "supabase_db_gradientpeak_e2e",
      {
        "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "55322" }],
      },
      ["POSTGRES_PASSWORD=synthetic-db-password"],
    ),
    inspection("supabase_kong_gradientpeak_e2e", {
      "8000/tcp": [{ HostIp: "::1", HostPort: "55321" }],
    }),
    inspection("supabase_storage_gradientpeak_e2e", {}, [`SERVICE_KEY=${serviceKey}`]),
  ];
}

test("derives only the browser runtime credential fields from the guarded local stack", () => {
  assert.deepEqual(
    deriveRuntimeWebE2EEnvironment({
      inspections: guardedStack(),
      environment: {},
      random: () => Buffer.alloc(32, 7),
    }),
    {
      DATABASE_URL: "postgresql://postgres:synthetic-db-password@127.0.0.1:55322/postgres",
      POSTGRES_URL: "postgresql://postgres:synthetic-db-password@127.0.0.1:55322/postgres",
      BETTER_AUTH_SECRET: `e2e-${Buffer.alloc(32, 7).toString("base64url")}`,
      NEXT_PRIVATE_SUPABASE_SECRET_KEY: serviceKey,
      SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    },
  );
});

test("refuses missing or mismatched E2E targets without exposing the service credential", () => {
  const missingDatabaseCredential = guardedStack();
  missingDatabaseCredential[0].Config.Env = [];
  assert.throws(
    () =>
      deriveRuntimeWebE2EEnvironment({ inspections: missingDatabaseCredential, environment: {} }),
    /database credential/,
  );
  const missingTarget = guardedStack().slice(0, 2);
  assert.throws(
    () => deriveRuntimeWebE2EEnvironment({ inspections: missingTarget, environment: {} }),
    (error) => {
      assert.match(error.message, /container identity/);
      assert.doesNotMatch(error.message, new RegExp(serviceKey));
      return true;
    },
  );

  const missingCredential = guardedStack();
  missingCredential[2].Config.Env = [];
  assert.throws(
    () => deriveRuntimeWebE2EEnvironment({ inspections: missingCredential, environment: {} }),
    (error) => {
      assert.match(error.message, /Storage service credential/);
      assert.doesNotMatch(error.message, new RegExp(serviceKey));
      return true;
    },
  );

  const mismatchedTarget = guardedStack();
  mismatchedTarget[1].Config.Labels["com.supabase.cli.project"] = "gradientpeak";
  assert.throws(
    () => deriveRuntimeWebE2EEnvironment({ inspections: mismatchedTarget, environment: {} }),
    /container identity/,
  );
});

test("database credentials cannot alter the validated connection destination", () => {
  const inspections = guardedStack();
  const password = "synthetic@host/path?host=elsewhere#fragment";
  inspections[0].Config.Env = [`POSTGRES_PASSWORD=${password}`];
  const result = deriveRuntimeWebE2EEnvironment({ inspections, environment: {} });
  const url = new URL(result.DATABASE_URL);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55322");
  assert.equal(url.pathname, "/postgres");
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
  assert.equal(decodeURIComponent(url.password), password);
});

test("masks each value before exporting it to the GitHub Actions environment file", () => {
  const events = [];
  prepareRuntimeWebE2E({
    inspect: guardedStack,
    environment: { GITHUB_ENV: "/tmp/github-env" },
    random: () => Buffer.alloc(32, 8),
    addMask: (value) => events.push(["mask", value]),
    appendEnvironment: (line) => events.push(["export", line]),
  });

  assert.deepEqual(
    events.map(([kind]) => kind),
    ["mask", "export", "mask", "export", "mask", "export", "mask", "export", "mask", "export"],
  );
  assert.deepEqual(
    events.filter(([kind]) => kind === "export").map(([, line]) => line.split("=")[0]),
    [
      "DATABASE_URL",
      "POSTGRES_URL",
      "BETTER_AUTH_SECRET",
      "NEXT_PRIVATE_SUPABASE_SECRET_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ],
  );
});

test("escapes workflow command data without changing the exported secret", () => {
  const unescaped = ["existing", "%0A", "secret", "%25"].join("");
  const escapedCommand = ["::add-mask::existing", "%250A", "secret", "%2525\n"].join("");
  assert.equal(formatGitHubMaskCommand(unescaped), escapedCommand);
});

test("redacts Docker inspection failures before they reach CI output", () => {
  assert.throws(
    () =>
      prepareRuntimeWebE2E({
        inspect: () => {
          throw new Error(`docker failure with ${serviceKey}`);
        },
        environment: { GITHUB_ENV: "/tmp/github-env" },
      }),
    (error) => {
      assert.match(error.message, /Could not inspect/);
      assert.doesNotMatch(error.message, new RegExp(serviceKey));
      return true;
    },
  );
});
