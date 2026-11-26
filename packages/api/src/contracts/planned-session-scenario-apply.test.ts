import { describe, expect, it } from "vitest";
import {
  applyPlannedSessionScenarioRequestSchema,
  applyPlannedSessionScenarioResultSchema,
} from "./planned-session-scenario-apply";

const fingerprint = `v1:sha256:${"a".repeat(64)}`;
const operationId = "scenario-apply-operation-id-000000";
const preview = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  expectedSessionRevision: 1,
  expectedPlanRevision: 1,
  expectedStateRevision: 0,
  scenario: { kind: "as_planned" as const },
};

describe("planned-session scenario apply contracts", () => {
  it("accepts only the canonical preview request, fingerprint, and receipt operation ID", () => {
    expect(
      applyPlannedSessionScenarioRequestSchema.parse({
        preview,
        expectedPreviewFingerprint: fingerprint,
        operationId,
      }),
    ).toEqual({ preview, expectedPreviewFingerprint: fingerprint, operationId });
    expect(() =>
      applyPlannedSessionScenarioRequestSchema.parse({
        preview: { ...preview, structure: {} },
        expectedPreviewFingerprint: fingerprint,
        operationId,
      }),
    ).toThrow();
  });

  it("distinguishes persisted actions from unavailable and stale rederivations", () => {
    expect(
      applyPlannedSessionScenarioResultSchema.parse({
        status: "stale",
        reason: "preview_fingerprint",
        currentSessionRevision: 2,
        currentPlanRevision: 3,
        currentStateRevision: 4,
      }),
    ).toMatchObject({ status: "stale", reason: "preview_fingerprint" });
    expect(
      applyPlannedSessionScenarioResultSchema.parse({
        status: "unavailable",
        reason: "candidate_unavailable",
      }),
    ).toEqual({ status: "unavailable", reason: "candidate_unavailable" });
  });
});
