import { describe, expect, it } from "vitest";
import { publicActivitySessionRpeEvidenceUpdateSchema } from "./index";

describe("activity session RPE evidence validation", () => {
  it("has no direct update transport contract", () => {
    expect(publicActivitySessionRpeEvidenceUpdateSchema.safeParse({ rpe: 8 }).success).toBe(false);
  });
});
