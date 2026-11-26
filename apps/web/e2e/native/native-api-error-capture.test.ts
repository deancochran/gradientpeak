import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  captureNativePlannedSessionErrors,
  captureWorkspaceNativeErrors,
  parseNativePlannedSessionError,
} from "./native-api-error-capture";

class FakeLogcatChild extends EventEmitter {
  kills: string[] = [];
  stdout = new EventEmitter();

  kill(signal: string) {
    this.kills.push(signal);
    return true;
  }
}

const record =
  '[api] plannedSessions.getById {"applicationErrorCode": null, "errorClass": "TRPCClientError", "httpStatus": 503, "trpcCode": "INTERNAL_SERVER_ERROR"}';

function capture(
  child: FakeLogcatChild,
  options: NonNullable<Parameters<typeof captureNativePlannedSessionErrors>[1]> = {},
) {
  return captureNativePlannedSessionErrors("123", {
    ...options,
    spawnLogcat: () => child as never,
  });
}

test("parses only the retained React Native console format into finite metadata", () => {
  assert.deepEqual(parseNativePlannedSessionError(`ERROR  ${record}`), {
    applicationErrorCode: null,
    errorClass: "TRPCClientError",
    httpStatus: 503,
    trpcCode: "INTERNAL_SERVER_ERROR",
  });
  assert.equal(parseNativePlannedSessionError("[api] anotherProcedure {}"), null);
});

test("retains a short relevant line from a multi-line chunk larger than the line bound", async () => {
  const child = new FakeLogcatChild();
  const diagnostic = capture(child);
  const stopping = diagnostic.stop();
  child.stdout.emit("data", Buffer.from(`${"x".repeat(1025)}\n${record}\n`));
  child.emit("close", 0);

  assert.deepEqual(await stopping, {
    records: [
      {
        applicationErrorCode: null,
        errorClass: "TRPCClientError",
        httpStatus: 503,
        trpcCode: "INTERNAL_SERVER_ERROR",
      },
    ],
    status: "unrecognized_relevant_format",
    truncated: true,
  });
});

test("discards an overlong split line through its newline before consuming the next line", async () => {
  const child = new FakeLogcatChild();
  const diagnostic = capture(child);
  const stopping = diagnostic.stop();
  child.stdout.emit("data", Buffer.from("x".repeat(1025)));
  child.stdout.emit("data", Buffer.from(`${record}\n${record}\n`));
  child.emit("close", 0);

  const result = await stopping;
  assert.equal(result.records.length, 1);
  assert.equal(result.status, "unrecognized_relevant_format");
  assert.equal(result.truncated, true);
});

test("preserves UTF-8 framing across chunks and drains a final line after exit before close", async () => {
  const child = new FakeLogcatChild();
  const diagnostic = capture(child);
  const stopping = diagnostic.stop();
  const prefix = Buffer.from(`INFO café ${record}`);
  child.stdout.emit("data", prefix.subarray(0, 9));
  child.emit("exit", 0);
  child.stdout.emit("data", prefix.subarray(9));
  child.emit("close", 0);

  const result = await stopping;
  assert.equal(child.kills[0], "SIGTERM");
  assert.equal(result.status, "captured");
  assert.equal(result.records.length, 1);
});

test("reports an unknown relevant format without treating an empty record list as success", async () => {
  const child = new FakeLogcatChild();
  const diagnostic = capture(child);
  const stopping = diagnostic.stop();
  child.stdout.emit("data", Buffer.from("[api] plannedSessions.getById unexpected\n"));
  child.emit("close", 0);

  assert.deepEqual(await stopping, {
    records: [],
    status: "unrecognized_relevant_format",
    truncated: false,
  });
});

test("classifies synchronous spawn and asynchronous child failures without raw output", async () => {
  const synchronous = captureNativePlannedSessionErrors("123", {
    spawnLogcat: () => {
      throw new Error("unavailable");
    },
  });
  assert.equal((await synchronous.stop()).status, "capture_failed");

  const child = new FakeLogcatChild();
  const asynchronous = capture(child);
  const stopping = asynchronous.stop();
  child.emit("error", new Error("unavailable"));
  child.emit("close", 1);
  assert.equal((await stopping).status, "capture_failed");
});

test("does not signal an already closed child", async () => {
  const child = new FakeLogcatChild();
  const diagnostic = capture(child);
  child.emit("close", 0);

  assert.equal((await diagnostic.stop()).status, "no_safe_error");
  assert.deepEqual(child.kills, []);
});

test("waits through SIGKILL for late output and close, or returns a bounded timeout", async () => {
  const child = new FakeLogcatChild();
  const diagnostic = capture(child, { closeGraceMs: 20, stopTimeoutMs: 1 });
  const stopping = diagnostic.stop();
  await new Promise((resolve) => setTimeout(resolve, 5));
  child.stdout.emit("data", Buffer.from(record));
  child.emit("close", 0);

  const lateClose = await stopping;
  assert.deepEqual(child.kills, ["SIGTERM", "SIGKILL"]);
  assert.equal(lateClose.status, "capture_timed_out");
  assert.equal(lateClose.records.length, 1);

  const noCloseChild = new FakeLogcatChild();
  const bounded = capture(noCloseChild, { closeGraceMs: 2, stopTimeoutMs: 1 });
  assert.equal((await bounded.stop()).status, "capture_timed_out");
});

test("does not start a logcat capture outside the focused workspace diagnostic", () => {
  let spawned = false;
  const diagnostic = captureWorkspaceNativeErrors(false, "123", {
    spawnLogcat: () => {
      spawned = true;
      return new FakeLogcatChild() as never;
    },
  });

  assert.equal(diagnostic, null);
  assert.equal(spawned, false);
});
