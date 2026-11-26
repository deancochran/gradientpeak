import assert from "node:assert/strict";
import { assertManagedSupabaseDatabaseTarget } from "./_target-safety";
import { assertPreviewTarget } from "./coaching-completion-review-upgrade";

const identity = { containerName: "supabase_db_gradientpeak", port: "54322" };
const inspection = {
  Name: "/supabase_db_gradientpeak",
  State: { Running: true },
  NetworkSettings: {
    Ports: {
      "5432/tcp": [
        { HostIp: "0.0.0.0", HostPort: "54322" },
        { HostIp: "::", HostPort: "54322" },
      ],
    },
    Networks: { default: { IPAddress: "172.18.0.10" } },
  },
};

assert.deepEqual(assertManagedSupabaseDatabaseTarget(identity, inspection), {
  containerName: "supabase_db_gradientpeak",
  serverAddress: "172.18.0.10",
  sourceTarget: "127.0.0.1:54322/postgres",
});
assertPreviewTarget("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
assert.throws(
  () => assertPreviewTarget("postgresql://postgres:postgres@127.0.0.1:54322/other"),
  /non-literal preview target/,
);
assert.throws(
  () =>
    assertManagedSupabaseDatabaseTarget(identity, {
      ...inspection,
      Name: "/foreign_database",
    }),
  /unmanaged Supabase database container target/,
);
assert.throws(
  () =>
    assertManagedSupabaseDatabaseTarget(identity, {
      ...inspection,
      NetworkSettings: {
        ...inspection.NetworkSettings,
        Ports: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "55322" }] },
      },
    }),
  /unmanaged Supabase database container target/,
);
assert.throws(
  () =>
    assertManagedSupabaseDatabaseTarget(identity, {
      ...inspection,
      NetworkSettings: {
        ...inspection.NetworkSettings,
        Ports: { "5432/tcp": [{ HostIp: "192.168.1.50", HostPort: "54322" }] },
      },
    }),
  /unmanaged Supabase database container target/,
);

console.log(
  "[coaching:completion-review:restore-target:test] literal IPv4 loopback route and managed Docker-internal source identity are distinct; foreign container, interface, port, and database refused",
);
