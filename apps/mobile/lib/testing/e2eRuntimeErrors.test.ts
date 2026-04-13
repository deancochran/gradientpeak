import { describe, expect, it } from "vitest";
import { classifyE2ERuntimeMessage, parseE2EProcedure } from "./e2eRuntimeErrors.shared";

describe("e2eRuntimeErrors", () => {
  it("classifies near-timeout aborted tRPC queries as failures", () => {
    expect(
      classifyE2ERuntimeMessage(
        'ERROR << query #24 events.list {"elapsedMs": 32359, "result": [TRPCClientError: Aborted]}',
      ),
    ).toBe("timeout_abort");
  });

  it("ignores fast aborted tRPC queries that look like navigation cancellation", () => {
    expect(
      classifyE2ERuntimeMessage(
        'ERROR << query #24 events.list {"elapsedMs": 512, "result": [TRPCClientError: Aborted]}',
      ),
    ).toBeNull();
  });

  it("classifies raw SQL failures surfaced by tRPC", () => {
    expect(
      classifyE2ERuntimeMessage(
        'ERROR << query #21 routes.list {"result": [TRPCClientError: Failed query: select * from activity_routes]}',
      ),
    ).toBe("server_query_failure");
  });

  it("extracts the tRPC procedure name from logger output", () => {
    expect(
      parseE2EProcedure(
        'ERROR << query #21 routes.list {"result": [TRPCClientError: Failed query: select * from activity_routes]}',
      ),
    ).toBe("routes.list");
  });
});
