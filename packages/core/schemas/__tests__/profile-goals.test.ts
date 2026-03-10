import { describe, expect, it } from "vitest";
import { canonicalGoalFixtures } from "../__fixtures__/profile-goals";
import {
  deriveGoalDemandProfile,
  parseProfileGoalRecord,
  profileGoalCreateSchema,
  profileGoalRecordSchema,
  profileGoalSchema,
  resolveGoalEventDate,
} from "../goals/profile_goals";

describe("canonical profile goal schemas", () => {
  it("parses supported canonical goal fixtures deterministically", () => {
    for (const fixture of canonicalGoalFixtures) {
      const parsedRecord = profileGoalRecordSchema.parse(fixture.record);
      const parsedGoal = parseProfileGoalRecord(fixture.record);

      expect(parsedRecord.target_payload).toEqual(fixture.goal.objective);
      expect(parsedGoal).toEqual(fixture.goal);
      expect(profileGoalSchema.parse(parsedGoal)).toEqual(fixture.goal);
    }
  });

  it("accepts canonical create payloads for supported goal fixtures", () => {
    for (const fixture of canonicalGoalFixtures) {
      const { id: _id, ...createInput } = fixture.record;
      const parsed = profileGoalCreateSchema.parse(createInput);

      expect(parsed.target_payload).toEqual(fixture.goal.objective);
    }
  });

  it("rejects mismatched objective activity categories", () => {
    const fixture = canonicalGoalFixtures[0]!;
    const parsed = profileGoalRecordSchema.safeParse({
      ...fixture.record,
      target_payload: {
        ...(fixture.record.target_payload as Record<string, unknown>),
        activity_category: "bike",
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["target_payload", "activity_category"],
          message:
            "objective.activity_category must match profile_goals.activity_category",
        }),
      ]),
    );
  });

  it("rejects event performance payloads without a deterministic target outcome", () => {
    const fixture = canonicalGoalFixtures[0]!;
    const parsed = profileGoalRecordSchema.safeParse({
      ...fixture.record,
      target_payload: {
        type: "event_performance",
        activity_category: "run",
        distance_m: 5000,
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["target_payload", "target_time_s"],
          message:
            "event_performance objectives require target_time_s or target_speed_mps",
        }),
      ]),
    );
  });

  it("rejects completion payloads without distance or duration", () => {
    const fixture = canonicalGoalFixtures[2]!;
    const parsed = profileGoalRecordSchema.safeParse({
      ...fixture.record,
      target_payload: {
        type: "completion",
        activity_category: "run",
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["target_payload", "distance_m"],
          message:
            "completion objectives require distance_m, duration_s, or both",
        }),
      ]),
    );
  });

  it("rejects consistency payloads without week-based cadence fields", () => {
    const fixture = canonicalGoalFixtures[3]!;
    const parsed = profileGoalRecordSchema.safeParse({
      ...fixture.record,
      target_payload: {
        type: "consistency",
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["target_payload", "target_sessions_per_week"],
          message:
            "consistency objectives require target_sessions_per_week, target_weeks, or both",
        }),
      ]),
    );
  });
});

describe("canonical profile goal helpers", () => {
  it("resolves linked event dates from milestone events", () => {
    for (const fixture of canonicalGoalFixtures) {
      expect(resolveGoalEventDate(fixture.goal, fixture.linkedEvent)).toBe(
        fixture.resolvedEventDate,
      );
    }
  });

  it("rejects mismatched linked events during date resolution", () => {
    expect(() =>
      resolveGoalEventDate(canonicalGoalFixtures[0]!.goal, {
        ...canonicalGoalFixtures[0]!.linkedEvent,
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      }),
    ).toThrow(
      "linked event id must match goal.milestone_event_id for timing resolution",
    );
  });

  it("derives deterministic demand profiles for supported canonical goal types", () => {
    for (const fixture of canonicalGoalFixtures) {
      expect(deriveGoalDemandProfile(fixture.goal)).toEqual(
        fixture.demandProfile,
      );
    }
  });
});
