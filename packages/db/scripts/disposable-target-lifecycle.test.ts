import assert from "node:assert/strict";
import {
  completeDisposableDatabaseRun,
  type DisposableAdminPool,
  type DisposablePool,
  teardownDisposableDatabase,
} from "./_disposable-target";

type Query = { text: string; values?: unknown[] };

function fakeAdmin(
  counts: number[],
  failures: Record<number, Error> = {},
  endFailure?: Error,
): DisposableAdminPool & { queries: Query[]; readonly ended: boolean } {
  const queries: Query[] = [];
  let queryCount = 0;
  let ended = false;
  return {
    queries,
    get ended() {
      return ended;
    },
    async query(text: string, values?: unknown[]) {
      queries.push(values === undefined ? { text } : { text, values });
      const failure = failures[queryCount++];
      if (failure) throw failure;
      if (text.includes("count(*)")) return { rows: [{ count: counts.shift() ?? 0 }] };
      return { rows: [] };
    },
    async end() {
      ended = true;
      if (endFailure) throw endFailure;
    },
  };
}

for (const callbackError of [undefined, null, 0, false]) {
  let threw = false;
  let observed: unknown;
  try {
    completeDisposableDatabaseRun(
      { completed: false, error: callbackError },
      { completed: true, value: undefined },
    );
  } catch (error) {
    threw = true;
    observed = error;
  }
  assert.equal(threw, true, `falsy callback failure ${String(callbackError)} remains a failure`);
  assert.equal(observed, callbackError);
}

const database = "gradientpeak_lifecycle_123_456";

{
  const admin = fakeAdmin([0]);
  let targetEnded = false;
  const target: DisposablePool = {
    async end() {
      targetEnded = true;
    },
  };
  await teardownDisposableDatabase(target, admin, database);
  assert.equal(targetEnded, true, "the harness-owned target pool closes first");
  assert.equal(admin.ended, true, "the admin pool closes after the drop");
  assert.equal(
    admin.queries.some((query) => query.text.includes("pg_terminate_backend")),
    false,
    "normal pool closure does not terminate an already-closing client",
  );
  assert.equal(admin.queries.at(-1)?.text, `drop database if exists "${database}"`);
}

{
  const waitFailure = undefined;
  const admin = fakeAdmin([1]);
  await assert.rejects(
    teardownDisposableDatabase({ async end() {} }, admin, database, {
      maxClientCloseChecks: 2,
      async wait() {
        return Promise.reject(waitFailure);
      },
    }),
    (error: unknown) => error instanceof AggregateError && error.errors.includes(waitFailure),
    "a rejected wait remains visible after fallback cleanup",
  );
  assert.equal(
    admin.queries.some((query) => query.text.includes("pg_terminate_backend")),
    true,
    "a rejected wait still performs narrow fallback cleanup",
  );
  assert.equal(admin.queries.at(-1)?.text, `drop database if exists "${database}"`);
  assert.equal(admin.ended, true, "admin cleanup runs after wait rejection");
}

{
  const admin = fakeAdmin([1, 0]);
  let waits = 0;
  await teardownDisposableDatabase({ async end() {} }, admin, database, {
    maxClientCloseChecks: 2,
    async wait() {
      waits += 1;
    },
  });
  assert.equal(waits, 1, "the close check waits only between bounded probes");
  assert.equal(
    admin.queries.filter((query) => query.text.includes("pg_terminate_backend")).length,
    0,
    "a backend that disappears during the bounded wait is not terminated",
  );
}

for (const invalidChecks of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 21]) {
  const admin = fakeAdmin([0]);
  let targetEnded = false;
  await assert.rejects(
    teardownDisposableDatabase(
      {
        async end() {
          targetEnded = true;
        },
      },
      admin,
      database,
      { maxClientCloseChecks: invalidChecks },
    ),
    /maxClientCloseChecks must be an integer from 1 through 20/,
  );
  assert.equal(targetEnded, false, `invalid check count ${invalidChecks} does not close target`);
  assert.equal(admin.queries.length, 0, `invalid check count ${invalidChecks} issues no query`);
  assert.equal(admin.ended, false, `invalid check count ${invalidChecks} does not close admin`);
}

{
  const admin = fakeAdmin([1]);
  const targetFailure = new Error("target close failed");
  await assert.rejects(
    teardownDisposableDatabase(
      {
        async end() {
          throw targetFailure;
        },
      },
      admin,
      database,
      { maxClientCloseChecks: 1 },
    ),
    (error: unknown) => error instanceof AggregateError && error.errors.includes(targetFailure),
    "target close errors remain visible after fallback cleanup",
  );
  assert.equal(
    admin.queries.some((query) => query.text.includes("pg_terminate_backend")),
    true,
    "failed target closure still gets the narrow termination fallback",
  );
  assert.equal(admin.queries.at(-1)?.text, `drop database if exists "${database}"`);
  assert.equal(admin.ended, true, "admin cleanup runs after a target close failure");
}

{
  const dropFailure = new Error("drop failed");
  const endFailure = new Error("admin close failed");
  const admin = fakeAdmin([0], { 1: dropFailure }, endFailure);
  await assert.rejects(
    teardownDisposableDatabase({ async end() {} }, admin, database),
    (error: unknown) =>
      error instanceof AggregateError &&
      error.errors.includes(dropFailure) &&
      error.errors.includes(endFailure),
    "drop and admin-pool failures remain visible",
  );
  assert.equal(admin.ended, true, "admin end still runs after drop failure");
}

{
  const admin = fakeAdmin([0]);
  let targetEnded = false;
  await assert.rejects(
    teardownDisposableDatabase(
      {
        async end() {
          targetEnded = true;
        },
      },
      admin,
      "postgres",
    ),
    /unsafe disposable database name/,
  );
  assert.equal(targetEnded, false, "unsafe names fail before target-pool side effects");
  assert.equal(admin.queries.length, 0, "unsafe names issue no admin query");
  assert.equal(admin.ended, false, "unsafe names do not close the supplied admin pool");
}

console.log("[db:disposable-target:lifecycle:test] bounded teardown preserves cleanup errors");
