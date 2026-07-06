import { describe, expect, it } from "vitest";
import {
  activityEffortCreateInputSchema,
  activityEffortUpdateInputSchema,
} from "../activity_efforts";

const validCreateInput = {
  activity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  activity_category: "bike",
  duration_seconds: 1200,
  effort_type: "power",
  value: 285,
  unit: "w",
  start_offset: 60,
  recorded_at: "2026-07-05T19:00:00.000Z",
} as const;

describe("activity effort input schemas", () => {
  it("accepts the shared create input shape", () => {
    const parsed = activityEffortCreateInputSchema.parse(validCreateInput);

    expect(parsed).toEqual(validCreateInput);
  });

  it("rejects unknown create keys", () => {
    const parsed = activityEffortCreateInputSchema.safeParse({
      ...validCreateInput,
      profile_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts update input with id and a partial writable shape", () => {
    const parsed = activityEffortUpdateInputSchema.parse({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      duration_seconds: 900,
      unit: "w",
    });

    expect(parsed).toEqual({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      duration_seconds: 900,
      unit: "w",
    });
  });

  it("requires positive duration_seconds", () => {
    expect(
      activityEffortCreateInputSchema.safeParse({
        ...validCreateInput,
        duration_seconds: 0,
      }).success,
    ).toBe(false);
  });

  it("requires a nonempty unit", () => {
    expect(
      activityEffortCreateInputSchema.safeParse({
        ...validCreateInput,
        unit: "",
      }).success,
    ).toBe(false);
  });

  it("requires recorded_at to be a datetime string", () => {
    expect(
      activityEffortCreateInputSchema.safeParse({
        ...validCreateInput,
        recorded_at: "2026-07-05",
      }).success,
    ).toBe(false);
  });
});
