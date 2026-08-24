import assert from "node:assert/strict";
import test from "node:test";

import {
  planE2EDatabaseCommand,
  redactCommandFailure,
  requireE2EContainerNamespace,
  requireOrderedMigrationPrefix,
} from "./e2e-db-command";

test("plans only the four bounded E2E lifecycle commands", () => {
  assert.deepEqual(planE2EDatabaseCommand("start", true), {
    action: "start",
    dryRun: true,
    projectId: "gradientpeak_e2e",
  });
  assert.deepEqual(planE2EDatabaseCommand("migrate", false), {
    action: "migrate",
    dryRun: false,
    projectId: "gradientpeak_e2e",
  });
  assert.throws(() => planE2EDatabaseCommand("reset", true), /start, migrate, status, stop/);
});

test("redacts credentials and tokens from subprocess failures", () => {
  const message = redactCommandFailure(
    "postgresql://postgres:secret@127.0.0.1:55322/postgres service_role_key=secret-token anon key: secret-anon",
  );
  assert.doesNotMatch(message, /secret|token/);
  assert.match(message, /redacted/);
});

test("accepts only an ordered applied-migration prefix before mutation", () => {
  assert.equal(requireOrderedMigrationPrefix([], ["20260101000000", "20260202000000"]), 0);
  assert.equal(
    requireOrderedMigrationPrefix(["20260101000000"], ["20260101000000", "20260202000000"]),
    1,
  );
  assert.throws(
    () =>
      requireOrderedMigrationPrefix(
        ["20260101000000", "20260303000000"],
        ["20260101000000", "20260202000000"],
      ),
    /not an ordered prefix/,
  );
  assert.throws(
    () =>
      requireOrderedMigrationPrefix(
        ["20260101000000", "20260202000000", "20260303000000"],
        ["20260101000000", "20260202000000"],
      ),
    /not an ordered prefix/,
  );
});

test("requires exact E2E project labels and published database/API ports", () => {
  const valid = [
    {
      Name: "/supabase_db_gradientpeak_e2e",
      Config: {
        Labels: {
          "com.docker.compose.project": "gradientpeak_e2e",
          "com.supabase.cli.project": "gradientpeak_e2e",
        },
      },
      NetworkSettings: { Ports: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "55322" }] } },
    },
    {
      Name: "/supabase_kong_gradientpeak_e2e",
      Config: {
        Labels: {
          "com.docker.compose.project": "gradientpeak_e2e",
          "com.supabase.cli.project": "gradientpeak_e2e",
        },
      },
      NetworkSettings: { Ports: { "8000/tcp": [{ HostIp: "0.0.0.0", HostPort: "55321" }] } },
    },
  ];
  assert.equal(requireE2EContainerNamespace(valid), 2);
  assert.throws(
    () =>
      requireE2EContainerNamespace([
        {
          ...valid[0],
          Config: { Labels: { "com.supabase.cli.project": "gradientpeak" } },
        },
        valid[1],
      ]),
    /namespace metadata/,
  );
  assert.throws(
    () =>
      requireE2EContainerNamespace([
        {
          ...valid[0],
          NetworkSettings: {
            Ports: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "54322" }] },
          },
        },
        valid[1],
      ]),
    /published port/,
  );
});
