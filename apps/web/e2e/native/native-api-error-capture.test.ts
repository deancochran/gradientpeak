import assert from "node:assert/strict";
import test from "node:test";
import { parseNativePlannedSessionError } from "./native-api-error-capture";

test("retains only finite planned-session client error metadata", () => {
  assert.deepEqual(
    parseNativePlannedSessionError(
      '[api] plannedSessions.getById {"applicationErrorCode":null,"errorClass":"TRPCClientError","httpStatus":503,"trpcCode":"INTERNAL_SERVER_ERROR"}',
    ),
    {
      applicationErrorCode: null,
      errorClass: "TRPCClientError",
      httpStatus: 503,
      trpcCode: "INTERNAL_SERVER_ERROR",
    },
  );
  assert.equal(parseNativePlannedSessionError("[api] anotherProcedure {}"), null);
  assert.equal(
    parseNativePlannedSessionError(
      `[api] plannedSessions.getById {"errorClass":"Error","httpStatus":200,"trpcCode":"SECRET"} ${"x".repeat(1024)}`,
    ),
    null,
  );
});
