import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  captureNativePlannedSessionErrors,
  captureWorkspaceNativeErrors,
  parseNativePlannedSessionError,
} from "./native-api-error-capture";

class FakeLogcatChild extends EventEmitter {
  exitCode: number | null = null;
  kills: string[] = [];
  stdout = new EventEmitter();

  kill(signal: string) {
    this.kills.push(signal);
    return true;
  }
}

const record =
  '[api] plannedSessions.getById {"applicationErrorCode": null, "errorClass": "TRPCClientError", "httpStatus": 503, "trpcCode": "INTERNAL_SERVER_ERROR"}';

test("parses the retained React Native console format into finite metadata", () => {
  assert.deepEqual(parseNativePlannedSessionError(`ERROR  ${record}`), {
    applicationErrorCode: null,
    errorClass: "TRPCClientError",
    httpStatus: 503,
    trpcCode: "INTERNAL_SERVER_ERROR",
  });
  assert.equal(parseNativePlannedSessionError("[api] anotherProcedure {}"), null);
});

test("drains a final unterminated line after process exit and before close", async () => {
  const child = new FakeLogcatChild();
  const capture = captureNativePlannedSessionErrors("123", { spawnLogcat: () => child as never });
  const stopping = capture.stop();
  child.exitCode = 0;
  child.emit("exit", 0);
  child.stdout.emit("data", Buffer.from(record));
  child.emit("close", 0);
  const result = await stopping;

  assert.equal(child.kills[0], "SIGTERM");
  assert.equal(result.status, "captured");
  assert.equal(result.records.length, 1);
});

test("classifies a spawn failure without retaining raw output", async () => {
  const child = new FakeLogcatChild();
  const capture = captureNativePlannedSessionErrors("123", { spawnLogcat: () => child as never });
  const stopping = capture.stop();
  child.emit("error", new Error("unavailable"));
  child.emit("close", 1);

  assert.deepEqual(await stopping, { records: [], status: "capture_failed" });
});

test("bounds shutdown by escalating to SIGKILL", async () => {
  const child = new FakeLogcatChild();
  const capture = captureNativePlannedSessionErrors("123", {
    killTimeoutMs: 1,
    spawnLogcat: () => child as never,
  });
  const result = await capture.stop();

  assert.deepEqual(child.kills, ["SIGTERM", "SIGKILL"]);
  assert.deepEqual(result, { records: [], status: "capture_timed_out" });
});

test("does not start a logcat capture outside the focused workspace diagnostic", () => {
  let spawned = false;
  const capture = captureWorkspaceNativeErrors(false, "123", {
    spawnLogcat: () => {
      spawned = true;
      return new FakeLogcatChild() as never;
    },
  });

  assert.equal(capture, null);
  assert.equal(spawned, false);
});
