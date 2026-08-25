import assert from "node:assert/strict";
import test from "node:test";

import {
  e2eSupabaseStartArguments,
  planE2EDatabaseCommand,
  redactCommandFailure,
  requireE2EContainerIdentity,
  requireE2EContainerNamespace,
  requireE2ELoopbackNetwork,
  requireOrderedMigrationPrefix,
  runGuardedE2EStart,
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

test("requires exact E2E project labels and loopback database/API ports", () => {
  type Inspection = Parameters<typeof requireE2EContainerNamespace>[0][number];
  const valid: [Inspection, Inspection] = [
    {
      Name: "/supabase_db_gradientpeak_e2e",
      Config: {
        Labels: {
          "com.docker.compose.project": "gradientpeak_e2e",
          "com.supabase.cli.project": "gradientpeak_e2e",
        },
      },
      NetworkSettings: {
        Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "55322" }] },
      },
    },
    {
      Name: "/supabase_kong_gradientpeak_e2e",
      Config: {
        Labels: {
          "com.docker.compose.project": "gradientpeak_e2e",
          "com.supabase.cli.project": "gradientpeak_e2e",
        },
      },
      NetworkSettings: { Ports: { "8000/tcp": [{ HostIp: "::1", HostPort: "55321" }] } },
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
            Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "54322" }] },
          },
        },
        valid[1],
      ]),
    /published port/,
  );
  assert.throws(
    () =>
      requireE2EContainerNamespace([
        ...valid,
        {
          Name: "/supabase_studio_gradientpeak_e2e",
          Config: {
            Labels: {
              "com.docker.compose.project": "gradientpeak_e2e",
              "com.supabase.cli.project": "gradientpeak_e2e",
            },
          },
          NetworkSettings: {
            Ports: { "3000/tcp": [{ HostIp: "127.0.0.1", HostPort: "6000" }] },
          },
        },
      ]),
    /outside the reserved 55320-55329 range/,
  );
});

test("rejects wildcard and non-loopback E2E container bindings", () => {
  type Inspection = Parameters<typeof requireE2EContainerNamespace>[0][number];
  const inspection = (name: string, containerPort: string, hostPort: string): Inspection => ({
    Name: name,
    Config: {
      Labels: {
        "com.docker.compose.project": "gradientpeak_e2e",
        "com.supabase.cli.project": "gradientpeak_e2e",
      },
    },
    NetworkSettings: {
      Ports: { [containerPort]: [{ HostIp: "127.0.0.1", HostPort: hostPort }] },
    },
  });
  const valid: [Inspection, Inspection] = [
    inspection("/supabase_db_gradientpeak_e2e", "5432/tcp", "55322"),
    inspection("/supabase_kong_gradientpeak_e2e", "8000/tcp", "55321"),
  ];

  for (const hostIp of ["0.0.0.0", "::", "192.0.2.10", undefined]) {
    assert.throws(
      () =>
        requireE2EContainerNamespace([
          {
            ...valid[0],
            NetworkSettings: {
              Ports: { "5432/tcp": [{ HostIp: hostIp, HostPort: "55322" }] },
            },
          },
          valid[1],
        ]),
      /loopback/,
    );
  }
});

test("requires a dedicated Docker network whose default published-port binding is loopback", () => {
  const network = {
    Driver: "bridge",
    Labels: { "com.gradientpeak.environment": "e2e" },
    Name: "gradientpeak_e2e_loopback",
    Options: { "com.docker.network.bridge.host_binding_ipv4": "127.0.0.1" },
  };

  assert.equal(requireE2ELoopbackNetwork(network), "gradientpeak_e2e_loopback");
  assert.deepEqual(e2eSupabaseStartArguments(), [
    "start",
    "--network-id",
    "gradientpeak_e2e_loopback",
  ]);
  for (const invalid of [
    { ...network, Name: "gradientpeak" },
    { ...network, Driver: "host" },
    { ...network, Labels: { "com.gradientpeak.environment": "manual" } },
    {
      ...network,
      Options: { "com.docker.network.bridge.host_binding_ipv4": "0.0.0.0" },
    },
  ]) {
    assert.throws(() => requireE2ELoopbackNetwork(invalid), /loopback network/);
  }
});

test("stops a strictly identified E2E stack when post-start port validation fails", () => {
  const calls: string[] = [];
  type Inspection = Parameters<typeof requireE2EContainerIdentity>[0][number];
  const inspections: [Inspection, Inspection] = [
    {
      Name: "/supabase_db_gradientpeak_e2e",
      Config: {
        Labels: {
          "com.docker.compose.project": "gradientpeak_e2e",
          "com.supabase.cli.project": "gradientpeak_e2e",
        },
      },
    },
    {
      Name: "/supabase_kong_gradientpeak_e2e",
      Config: {
        Labels: {
          "com.docker.compose.project": "gradientpeak_e2e",
          "com.supabase.cli.project": "gradientpeak_e2e",
        },
      },
    },
  ];

  assert.equal(requireE2EContainerIdentity(inspections), 2);
  assert.equal(requireE2EContainerIdentity([inspections[0]]), 1);
  assert.throws(
    () =>
      runGuardedE2EStart(
        () => calls.push("start"),
        () => {
          calls.push("validate");
          throw new Error("published port was not bound to loopback");
        },
        () => {
          requireE2EContainerIdentity(inspections);
          calls.push("stop");
        },
      ),
    /not bound to loopback/,
  );
  assert.deepEqual(calls, ["start", "validate", "stop"]);
  assert.throws(
    () =>
      requireE2EContainerIdentity([
        {
          ...inspections[0],
          Config: { Labels: { "com.supabase.cli.project": "gradientpeak" } },
        },
        inspections[1],
      ]),
    /namespace metadata/,
  );
});
