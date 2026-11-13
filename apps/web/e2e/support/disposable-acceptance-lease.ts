import { randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

const LEASE_FILE = ".disposable-acceptance-lease.json";
const LEASE_MAX_AGE_MS = 2 * 60 * 60 * 1000;

type Lease = {
  version: 1;
  runId: string;
  target: string;
  capability: string;
  createdAt: number;
  owner: { pid: number; startIdentity?: string };
};

export type DisposableAcceptanceLeaseEnvironment = {
  E2E_RUN_ID?: string;
  E2E_DISPOSABLE_LEASE_CAPABILITY?: string;
  E2E_DISPOSABLE_LEASE_PATH?: string;
};

export type DisposableAcceptanceLeaseRuntime = {
  now: () => number;
  isOwnerLive: (pid: number) => boolean;
  ownerStartIdentity: (pid: number) => string | undefined;
};

const runtime: DisposableAcceptanceLeaseRuntime = {
  now: () => Date.now(),
  isOwnerLive: (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  },
  ownerStartIdentity: (pid) => {
    if (process.platform !== "linux") return undefined;
    try {
      // Field 22 survives PID reuse checks; the final ')' avoids spaces in comm.
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      const fields = stat
        .slice(stat.lastIndexOf(")") + 2)
        .trim()
        .split(/\s+/);
      return fields[19];
    } catch {
      return undefined;
    }
  },
};

function acceptanceTarget(connectionString: string) {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("Disposable acceptance lease target is invalid.");
  }
  const target = url.pathname.slice(1);
  if (!/^gradientpeak_web_acceptance_\d+_\d+$/.test(target))
    throw new Error("Disposable acceptance lease target is not a guarded acceptance database.");
  return target;
}

function privateDirectory(directory: string) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
}

export function createDisposableAcceptanceLease({
  artifacts,
  connectionString,
  runId,
}: {
  artifacts: string;
  connectionString: string;
  runId: string;
}) {
  if (process.platform !== "linux")
    throw new Error("Disposable acceptance leases require Linux process identity support.");
  privateDirectory(artifacts);
  const path = resolve(artifacts, LEASE_FILE);
  const capability = randomBytes(32).toString("base64url");
  const startIdentity = runtime.ownerStartIdentity(process.pid);
  if (!startIdentity)
    throw new Error("Disposable acceptance leases require a readable Linux process identity.");
  const lease: Lease = {
    version: 1,
    runId,
    target: acceptanceTarget(connectionString),
    capability,
    createdAt: runtime.now(),
    owner: { pid: process.pid, startIdentity },
  };
  const descriptor = openSync(path, "wx", 0o600);
  try {
    writeFileSync(descriptor, JSON.stringify(lease), "utf8");
  } finally {
    closeSync(descriptor);
  }
  return {
    E2E_DISPOSABLE_LEASE_CAPABILITY: capability,
    E2E_DISPOSABLE_LEASE_PATH: path,
  };
}

export function removeDisposableAcceptanceLease(path: string) {
  unlinkSync(path);
}

function invalidLease(): never {
  throw new Error("Disposable E2E requires a live runner-issued acceptance lease.");
}

export function validateDisposableAcceptanceLease(
  environment: DisposableAcceptanceLeaseEnvironment,
  connectionString: string,
  suppliedRuntime: DisposableAcceptanceLeaseRuntime = runtime,
) {
  if (process.platform !== "linux") invalidLease();
  const path = environment.E2E_DISPOSABLE_LEASE_PATH;
  const capability = environment.E2E_DISPOSABLE_LEASE_CAPABILITY;
  const runId = environment.E2E_RUN_ID;
  if (!path || !capability || !runId || !isAbsolute(path)) invalidLease();
  let parsed: Lease | undefined;
  try {
    const metadata = lstatSync(path);
    const status = statSync(path);
    const artifacts = lstatSync(dirname(path));
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      !status.isFile() ||
      (Number(status.mode) & 0o077) !== 0 ||
      !artifacts.isDirectory() ||
      artifacts.isSymbolicLink() ||
      (Number(artifacts.mode) & 0o077) !== 0 ||
      (typeof process.getuid === "function" && status.uid !== process.getuid())
    )
      invalidLease();
    const raw = readFileSync(path, "utf8");
    if (raw.length > 4096) invalidLease();
    parsed = JSON.parse(raw) as Lease;
  } catch {
    invalidLease();
  }
  if (!parsed) invalidLease();
  if (
    parsed.version !== 1 ||
    parsed.runId !== runId ||
    parsed.target !== acceptanceTarget(connectionString) ||
    parsed.capability !== capability ||
    !Number.isSafeInteger(parsed.createdAt) ||
    parsed.createdAt > suppliedRuntime.now() ||
    suppliedRuntime.now() - parsed.createdAt > LEASE_MAX_AGE_MS ||
    !Number.isSafeInteger(parsed.owner?.pid) ||
    parsed.owner.pid < 1 ||
    !suppliedRuntime.isOwnerLive(parsed.owner.pid) ||
    typeof parsed.owner.startIdentity !== "string" ||
    parsed.owner.startIdentity.length === 0 ||
    parsed.owner.startIdentity !== suppliedRuntime.ownerStartIdentity(parsed.owner.pid)
  ) {
    invalidLease();
  }
}
