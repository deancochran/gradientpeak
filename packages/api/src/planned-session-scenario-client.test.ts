import { describe, expect, it } from "vitest";
import {
  freezePlannedSessionScenarioOperation,
  isCurrentPlannedSessionScenarioOperation,
  parseFrozenPlannedSessionScenarioOperation,
  requiresFreshPlannedSessionScenarioPreview,
} from "./planned-session-scenario-client";

const preview = {
  sessionId: "6a3a39c2-1a7d-4b4e-9999-111111111111",
  expectedSessionRevision: 2,
  expectedPlanRevision: 3,
  expectedStateRevision: 4,
  scenario: { kind: "skip" as const },
};

describe("planned-session scenario client", () => {
  it("preserves one confirmed operation identity for retries", () => {
    const operation = freezePlannedSessionScenarioOperation({
      actorId: "athlete-a",
      expectedPreviewFingerprint: `v1:sha256:${"a".repeat(64)}`,
      operationId: "a".repeat(32),
      preview,
    });
    expect(operation.request).toMatchObject({ operationId: "a".repeat(32), preview });
    expect(
      isCurrentPlannedSessionScenarioOperation(operation, {
        actorId: "athlete-a",
        sessionId: preview.sessionId,
      }),
    ).toBe(true);
    expect(
      isCurrentPlannedSessionScenarioOperation(operation, {
        actorId: "athlete-b",
        sessionId: preview.sessionId,
      }),
    ).toBe(false);
  });

  it("requires a new preview for typed unavailable and stale results", () => {
    expect(
      requiresFreshPlannedSessionScenarioPreview({
        status: "unavailable",
        reason: "session_in_past",
      }),
    ).toBe(true);
    expect(
      requiresFreshPlannedSessionScenarioPreview({
        status: "stale",
        reason: "preview_fingerprint",
        currentSessionRevision: 2,
        currentPlanRevision: 3,
        currentStateRevision: 4,
      }),
    ).toBe(true);
  });

  it("rejects malformed or nested-session-mismatched recovery records", () => {
    const operation = freezePlannedSessionScenarioOperation({
      actorId: "00000000-0000-4000-8000-000000000001",
      expectedPreviewFingerprint: `v1:sha256:${"a".repeat(64)}`,
      operationId: "a".repeat(32),
      preview,
    });
    expect(
      parseFrozenPlannedSessionScenarioOperation({
        ...operation,
        sessionId: "00000000-0000-4000-8000-000000000002",
      }),
    ).toBeNull();
    expect(
      parseFrozenPlannedSessionScenarioOperation({ ...operation, actorId: "not-a-uuid" }),
    ).toBeNull();
  });
});
