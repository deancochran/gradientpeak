import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDisposableAcceptanceLease,
  type DisposableAcceptanceLeaseEnvironment,
  type DisposableAcceptanceLeaseRuntime,
  removeDisposableAcceptanceLease,
  validateDisposableAcceptanceLease,
} from "./disposable-acceptance-lease";

const connectionString =
  "postgresql://tester:test@127.0.0.1:54322/gradientpeak_web_acceptance_123_456";
const directories: string[] = [];
const testRuntime: DisposableAcceptanceLeaseRuntime = {
  now: () => 10_000,
  isOwnerLive: () => true,
  ownerStartIdentity: () => "start-identity",
};

function leaseEnvironment() {
  const artifacts = mkdtempSync(join(tmpdir(), "gradientpeak-lease-"));
  directories.push(artifacts);
  const lease = createDisposableAcceptanceLease({
    artifacts,
    connectionString,
    runId: "acceptance-test-run",
  });
  const path = lease.E2E_DISPOSABLE_LEASE_PATH;
  const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  value.createdAt = testRuntime.now();
  value.owner = { pid: 42, startIdentity: "start-identity" };
  writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
  return {
    ...lease,
    E2E_RUN_ID: "acceptance-test-run",
  } satisfies DisposableAcceptanceLeaseEnvironment;
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { force: true, recursive: true });
});

describe("disposable acceptance lease", () => {
  it("accepts only a matching live runner-issued target and run", () => {
    const environment = leaseEnvironment();
    expect(() =>
      validateDisposableAcceptanceLease(environment, connectionString, testRuntime),
    ).not.toThrow();
    expect(() =>
      validateDisposableAcceptanceLease(
        environment,
        connectionString.replace("123_456", "123_789"),
        testRuntime,
      ),
    ).toThrow(/live runner-issued/);
    expect(() =>
      validateDisposableAcceptanceLease(
        { ...environment, E2E_RUN_ID: "other-run" },
        connectionString,
        testRuntime,
      ),
    ).toThrow(/live runner-issued/);
  });

  it("rejects absent, stale, capability-mismatched, dead-owner, and permissive leases", () => {
    const environment = leaseEnvironment();
    expect(() => validateDisposableAcceptanceLease({}, connectionString, testRuntime)).toThrow(
      /live runner-issued/,
    );
    expect(() =>
      validateDisposableAcceptanceLease(
        { ...environment, E2E_DISPOSABLE_LEASE_CAPABILITY: "wrong" },
        connectionString,
        testRuntime,
      ),
    ).toThrow(/live runner-issued/);
    const path = environment.E2E_DISPOSABLE_LEASE_PATH ?? "";
    const stale = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    stale.createdAt = testRuntime.now() - 3 * 60 * 60 * 1000;
    writeFileSync(path, JSON.stringify(stale));
    expect(() =>
      validateDisposableAcceptanceLease(environment, connectionString, testRuntime),
    ).toThrow(/live runner-issued/);
    stale.createdAt = testRuntime.now();
    writeFileSync(path, JSON.stringify(stale));
    const missingIdentity = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    missingIdentity.owner = { pid: 42 };
    writeFileSync(path, JSON.stringify(missingIdentity));
    expect(() =>
      validateDisposableAcceptanceLease(environment, connectionString, testRuntime),
    ).toThrow(/live runner-issued/);
    writeFileSync(path, JSON.stringify(stale));
    expect(() =>
      validateDisposableAcceptanceLease(environment, connectionString, {
        ...testRuntime,
        isOwnerLive: () => false,
      }),
    ).toThrow(/live runner-issued/);
    chmodSync(path, 0o644);
    expect(() =>
      validateDisposableAcceptanceLease(environment, connectionString, testRuntime),
    ).toThrow(/live runner-issued/);
  });

  it("rejects symbolic-link lease files and removes only the runner lease", () => {
    const environment = leaseEnvironment();
    const path = environment.E2E_DISPOSABLE_LEASE_PATH ?? "";
    const replacement = join(join(path, ".."), "replacement.json");
    writeFileSync(replacement, readFileSync(path), { mode: 0o600 });
    removeDisposableAcceptanceLease(path);
    symlinkSync(replacement, path);
    expect(() =>
      validateDisposableAcceptanceLease(environment, connectionString, testRuntime),
    ).toThrow(/live runner-issued/);
  });

  it("rejects malformed, oversized, and symbolic-link artifact directories", () => {
    const environment = leaseEnvironment();
    const path = environment.E2E_DISPOSABLE_LEASE_PATH ?? "";
    writeFileSync(path, "not-json");
    expect(() =>
      validateDisposableAcceptanceLease(environment, connectionString, testRuntime),
    ).toThrow(/live runner-issued/);
    writeFileSync(path, "x".repeat(4097));
    expect(() =>
      validateDisposableAcceptanceLease(environment, connectionString, testRuntime),
    ).toThrow(/live runner-issued/);
    const linkedEnvironment = leaseEnvironment();
    const linkedPath = linkedEnvironment.E2E_DISPOSABLE_LEASE_PATH ?? "";
    const directory = join(linkedPath, "..");
    const linkedDirectory = join(directory, "linked-artifacts");
    symlinkSync(directory, linkedDirectory);
    expect(() =>
      validateDisposableAcceptanceLease(
        {
          ...linkedEnvironment,
          E2E_DISPOSABLE_LEASE_PATH: join(linkedDirectory, basename(linkedPath)),
        },
        connectionString,
        testRuntime,
      ),
    ).toThrow(/live runner-issued/);
  });
});
