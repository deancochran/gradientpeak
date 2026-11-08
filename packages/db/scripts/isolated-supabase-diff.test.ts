import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cleanupIsolatedSupabaseDiffWorkdir,
  createIsolatedSupabaseDiffWorkdir,
  type IsolatedSupabaseDiffWorkdir,
  isRetryableShadowPortAllocationFailure,
  runIsolatedSupabaseDiff,
} from "./isolated-supabase-diff";

const fixture = mkdtempSync(join(tmpdir(), "isolated-supabase-diff-test-"));
const source = join(fixture, "source");
mkdirSync(join(source, "migrations"), { recursive: true });
writeFileSync(
  join(source, "config.toml"),
  'project_id = "authoritative"\n\n[db]\nport = 54322\nshadow_port = 54320\n',
);

const workdir = await createIsolatedSupabaseDiffWorkdir({
  sourceSupabaseRoot: source,
  temporaryParent: fixture,
});
try {
  assert.match(workdir.projectId, /^gradientpeak_fresh_diff_[a-f\d]{32}$/);
  assert.ok(workdir.shadowPort >= 1 && workdir.shadowPort <= 65_535);
  assert.ok(workdir.root.startsWith(`${fixture}/gradientpeak-fresh-diff-`));
  const config = readFileSync(join(workdir.root, "supabase", "config.toml"), "utf8");
  assert.match(config, new RegExp(`^project_id = "${workdir.projectId}"$`, "m"));
  assert.match(config, new RegExp(`^shadow_port = ${workdir.shadowPort}$`, "m"));
  assert.equal(lstatSync(join(workdir.root, "supabase", "migrations")).isSymbolicLink(), true);
} finally {
  cleanupIsolatedSupabaseDiffWorkdir(workdir);
  assert.equal(existsSync(workdir.root), false);
  rmSync(fixture, { force: true, recursive: true });
}

console.info(
  "[db:isolated-supabase-diff] isolated config, migration link, ephemeral port, and cleanup passed",
);

const retryableBindFailure = new Error(
  "Supabase CLI failed:\nLegacyShadowDbError: Bind for 127.0.0.1:54320 failed: port is already allocated",
);
const retryableAddressFailure = new Error(
  "Supabase CLI failed:\nLegacyShadowDbError: shadow database address already in use",
);
assert.equal(isRetryableShadowPortAllocationFailure(retryableBindFailure), true);
assert.equal(isRetryableShadowPortAllocationFailure(retryableAddressFailure), true);
assert.equal(isRetryableShadowPortAllocationFailure(new Error("port is already allocated")), false);
assert.equal(
  isRetryableShadowPortAllocationFailure(new Error("LegacyShadowDbError: migration failed")),
  false,
);

const runnerFixture = mkdtempSync(join(tmpdir(), "isolated-supabase-diff-runner-test-"));
const created: IsolatedSupabaseDiffWorkdir[] = [];
const cleaned: string[] = [];
let nextPort = 56_000;
const dependencies = {
  cleanup(workdir: IsolatedSupabaseDiffWorkdir) {
    cleaned.push(workdir.root);
    rmSync(workdir.root, { force: true, recursive: true });
  },
  async create(_options: unknown, excludedPorts: ReadonlySet<number>) {
    const shadowPort = nextPort++;
    assert.equal(excludedPorts.has(shadowPort), false);
    const owned = {
      projectId: `test_${shadowPort}`,
      root: mkdtempSync(join(runnerFixture, "attempt-")),
      shadowPort,
    };
    created.push(owned);
    return owned;
  },
};
try {
  let calls = 0;
  const result = await runIsolatedSupabaseDiff(
    { sourceSupabaseRoot: source },
    () => {
      calls += 1;
      if (calls === 1) throw retryableBindFailure;
      return "empty diff";
    },
    dependencies,
  );
  assert.equal(result, "empty diff");
  assert.equal(calls, 2);
  assert.notEqual(created[0]?.shadowPort, created[1]?.shadowPort);
  assert.deepEqual(
    cleaned,
    created.slice(0, 2).map(({ root }) => root),
  );
  assert.ok(created.slice(0, 2).every(({ root }) => !existsSync(root)));

  const exhaustionStart = created.length;
  await assert.rejects(
    runIsolatedSupabaseDiff(
      { sourceSupabaseRoot: source },
      () => {
        throw retryableAddressFailure;
      },
      dependencies,
    ),
    retryableAddressFailure,
  );
  assert.equal(created.length - exhaustionStart, 2);
  assert.ok(created.slice(exhaustionStart).every(({ root }) => !existsSync(root)));

  const nonRetryStart = created.length;
  const nonRetryable = new Error("Supabase CLI failed: ordinary schema failure");
  await assert.rejects(
    runIsolatedSupabaseDiff(
      { sourceSupabaseRoot: source },
      () => {
        throw nonRetryable;
      },
      dependencies,
    ),
    nonRetryable,
  );
  assert.equal(created.length - nonRetryStart, 1);
  assert.ok(created.slice(nonRetryStart).every(({ root }) => !existsSync(root)));
} finally {
  rmSync(runnerFixture, { force: true, recursive: true });
}

console.info("[db:isolated-supabase-diff] bounded retry only recovers confirmed shadow binds");
