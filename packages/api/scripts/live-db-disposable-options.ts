export type DisposableLiveDbCommand = Readonly<{
  testFile: string;
}>;

const requiredFlags = new Set(["--disposable", "--local"]);
const guardedLoopbackHosts = new Set(["127.0.0.1", "[::1]"]);
const disposableDatabasePattern = /^gradientpeak_api_live_db_\d+_\d+$/;

type DisposableLiveDbReceipt = Readonly<{
  databaseUrl: string;
  postgresUrl: string;
}>;

function requireSingleLeadingDelimiter(args: readonly string[]) {
  const delimiters = args.flatMap((arg, index) => (arg === "--" ? [index] : []));
  if (delimiters.length > 1 || (delimiters.length === 1 && delimiters[0] !== 0)) {
    throw new Error("permit at most one leading -- delimiter");
  }
}

function parseReceipt(value: unknown): DisposableLiveDbReceipt {
  const receipt = value as Record<string, unknown>;
  if (
    value === null ||
    typeof value !== "object" ||
    !Object.hasOwn(receipt, "databaseUrl") ||
    !Object.hasOwn(receipt, "postgresUrl") ||
    typeof receipt.databaseUrl !== "string" ||
    typeof receipt.postgresUrl !== "string"
  ) {
    throw new Error("invalid disposable live-DB receipt");
  }
  return { databaseUrl: receipt.databaseUrl, postgresUrl: receipt.postgresUrl };
}

function requireGuardedDisposableApiDatabaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("invalid disposable live-DB receipt URL");
  }
  if (
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    !guardedLoopbackHosts.has(url.hostname) ||
    /%|\\|\0/.test(url.pathname) ||
    !disposableDatabasePattern.test(url.pathname.slice(1))
  ) {
    throw new Error("receipt URL is not a guarded local disposable API database");
  }
  return url;
}

export function verifyDisposableLiveDbReceipt(input: {
  expected: unknown;
  actual: unknown;
}): DisposableLiveDbReceipt {
  const expected = parseReceipt(input.expected);
  const actual = parseReceipt(input.actual);
  requireGuardedDisposableApiDatabaseUrl(expected.databaseUrl);
  requireGuardedDisposableApiDatabaseUrl(expected.postgresUrl);
  requireGuardedDisposableApiDatabaseUrl(actual.databaseUrl);
  requireGuardedDisposableApiDatabaseUrl(actual.postgresUrl);
  if (expected.databaseUrl !== expected.postgresUrl) {
    throw new Error("expected target receipt has mismatched database URLs");
  }
  if (actual.databaseUrl !== expected.databaseUrl || actual.postgresUrl !== expected.postgresUrl) {
    throw new Error("child receipt does not match the generated disposable target");
  }
  return expected;
}

export function requireDisposableLiveDbFlags(args: readonly string[]) {
  const flags = args.filter((arg) => requiredFlags.has(arg));
  const remaining = args.filter((arg) => !requiredFlags.has(arg));
  if (flags.length !== requiredFlags.size || new Set(flags).size !== requiredFlags.size) {
    throw new Error("require --disposable and --local");
  }
  if (remaining.length !== 0) {
    throw new Error("unknown disposable live-DB runner arguments");
  }
}

export function parseDisposableLiveDbCommand(args: readonly string[]): DisposableLiveDbCommand {
  requireSingleLeadingDelimiter(args);
  const flags = args.filter((arg) => requiredFlags.has(arg));
  if (flags.length !== requiredFlags.size || new Set(flags).size !== requiredFlags.size) {
    throw new Error("require --disposable and --local");
  }

  const remaining = args.filter((arg) => arg !== "--" && !requiredFlags.has(arg));
  if (remaining.length !== 1) {
    throw new Error("provide exactly one package-relative src/**/*.live-db.test.ts file");
  }
  const [testFile] = remaining;
  if (
    !testFile ||
    testFile.includes("..") ||
    !/^src\/[a-zA-Z0-9_./-]+\.live-db\.test\.ts$/.test(testFile)
  ) {
    throw new Error("provide exactly one package-relative src/**/*.live-db.test.ts file");
  }
  return { testFile };
}

export function buildDisposableLiveDbVitestCommand(input: DisposableLiveDbCommand) {
  return ["exec", "vitest", "run", input.testFile, "--config", "vitest.live-db.config.ts"];
}
