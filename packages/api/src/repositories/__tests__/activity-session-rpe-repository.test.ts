import { describe, expect, it } from "vitest";
import {
  type ActivitySessionRpeEvidenceProjection,
  SessionRpeEvidenceIntegrityError,
  uniqueEffectiveSessionRpeEvidence,
} from "../activity-session-rpe-repository";

const evidence = (id: string): ActivitySessionRpeEvidenceProjection => ({
  id,
  profileId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  activityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  recordedAt: new Date("2026-07-30T00:00:00.000Z"),
  correctedAt: null,
  rpe: 7,
  scale: "borg_cr10",
  scaleVersion: "1",
  source: "user",
  operationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  correctionOfId: null,
  provenance: {},
  createdAt: new Date("2026-07-30T00:00:00.000Z"),
});

describe("SessionRpeEvidenceIntegrityError", () => {
  it("fails closed when duplicate effective observations are detected", () => {
    expect(() => uniqueEffectiveSessionRpeEvidence([evidence("one"), evidence("two")])).toThrow(
      SessionRpeEvidenceIntegrityError,
    );
  });
});
