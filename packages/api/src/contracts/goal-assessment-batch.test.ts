import { describe, expect, it } from "vitest";

import {
  goalAssessmentBatchRequestSchema,
  goalAssessmentBatchResponseSchema,
} from "./goal-assessment-batch";

const GOAL_ID = "11111111-1111-4111-8111-111111111111";

describe("goal assessment batch contract", () => {
  it("accepts a bounded unique UUID request and compact entries only", () => {
    expect(goalAssessmentBatchRequestSchema.parse({ goalIds: [GOAL_ID] })).toEqual({
      goalIds: [GOAL_ID],
    });
    expect(() =>
      goalAssessmentBatchRequestSchema.parse({ goalIds: [GOAL_ID], profileId: GOAL_ID }),
    ).toThrow();
    expect(() => goalAssessmentBatchRequestSchema.parse({ goalIds: [GOAL_ID, GOAL_ID] })).toThrow();
    expect(() =>
      goalAssessmentBatchRequestSchema.parse({ goalIds: Array(101).fill(GOAL_ID) }),
    ).toThrow();
    expect(() =>
      goalAssessmentBatchResponseSchema.parse({
        entries: [
          {
            goalId: GOAL_ID,
            readiness: null,
            freshness: "unavailable",
            confidence: 0,
            revision: null,
            computedAt: "2026-08-01T12:00:00.000Z",
            assessment: { readiness: 90 },
          },
        ],
      }),
    ).toThrow();
  });
});
