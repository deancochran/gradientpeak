#!/usr/bin/env tsx

import type { MigrationPolicy } from "./_migration-plan";
import { boundedSupabaseCliDatabaseUrl, safeSupabaseCliEnvironment } from "./_supabase-cli-wrapper";

const policy = {
  forwardMigrations: {
    autocommitSession: { lockTimeout: "5s", statementTimeout: "15min" },
  },
} as MigrationPolicy;
const disposableUrl = "postgresql://user:password@127.0.0.1:54322/gradientpeak_wrapper_test_1_2";

const childEnvironment = safeSupabaseCliEnvironment({
  PATH: "/safe/bin",
  HOME: "/safe/home",
  TMPDIR: "/safe/tmp",
  DATABASE_URL: "postgresql://sensitive:secret@remote.example.com:5432/shared",
  SUPABASE_ACCESS_TOKEN: "sensitive-access-token",
  SUPABASE_TELEMETRY_DISABLED: "0",
  DO_NOT_TRACK: "0",
  UNAPPROVED_CHILD_VARIABLE: "must-not-reach-cli",
});
if (childEnvironment.SUPABASE_TELEMETRY_DISABLED !== "1" || childEnvironment.DO_NOT_TRACK !== "1")
  throw new Error("Supabase CLI telemetry opt-out variables were not enforced");
for (const key of ["DATABASE_URL", "SUPABASE_ACCESS_TOKEN", "UNAPPROVED_CHILD_VARIABLE"]) {
  if (key in childEnvironment)
    throw new Error(`unapproved child environment variable leaked: ${key}`);
}
if (
  childEnvironment.PATH !== "/safe/bin" ||
  childEnvironment.HOME !== "/safe/home" ||
  childEnvironment.TMPDIR !== "/safe/tmp"
)
  throw new Error(
    "safe Supabase CLI child environment did not preserve platform runtime variables",
  );

const bounded = new URL(boundedSupabaseCliDatabaseUrl({ databaseUrl: disposableUrl, policy }));
if (bounded.searchParams.get("options") !== "-c lock_timeout=5s -c statement_timeout=15min")
  throw new Error("bounded wrapper did not derive connection options from migration policy");
const ipv6 = new URL(
  boundedSupabaseCliDatabaseUrl({
    databaseUrl: "postgresql://user:password@[::1]:54322/gradientpeak_wrapper_test_1_2",
    policy,
  }),
);
if (ipv6.hostname !== "[::1]") throw new Error("literal IPv6 loopback was not accepted");

function expectGuardError(databaseUrl: string, expected: string) {
  try {
    boundedSupabaseCliDatabaseUrl({ databaseUrl, policy });
    throw new Error(`guard accepted target expected to fail with: ${expected}`);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== expected) throw error;
  }
}

for (const [databaseUrl, expected] of [
  [
    "postgresql://user:password@example.com:5432/gradientpeak_wrapper_test_1_2",
    "refusing non-literal-loopback database host",
  ],
  [
    "postgresql://user:password@localhost:54322/gradientpeak_wrapper_test_1_2",
    "refusing non-literal-loopback database host",
  ],
  [
    "postgresql://user:password@127.0.0.1:54322/postgres",
    "refusing non-disposable local database name",
  ],
  [
    "postgresql://user:password@127.0.0.1:54322/gradientpeak_wrapper_test_1_2%2Fshared",
    "refusing encoded or credential-bearing database URL",
  ],
  ["not a database url", "refusing malformed database URL"],
] as const) {
  expectGuardError(databaseUrl, expected);
}

console.log(
  "[db:migration:supabase-cli-wrapper:test] telemetry opt-out is enforced without forwarding unapproved environment; literal IPv4/IPv6 disposable loopback accepted; hostname/shared/encoded/malformed targets rejected before spawn",
);
