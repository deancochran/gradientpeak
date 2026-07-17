import { describe, expect, it } from "vitest";
import { getPlanCategoryComposition } from "../home";

const step = (id: string) => ({
  id,
  name: "Steady",
  duration: { type: "time" as const, seconds: 600 },
  targets: [{ type: "RPE" as const, intensity: 5 }],
});

describe("home plan card projection", () => {
  it("derives ordered repeated and multisport composition from V3 segments", () => {
    const structure = {
      version: 3 as const,
      segments: [
        {
          id: "10000000-0000-4000-8000-000000000001",
          name: "Run one",
          role: "activity" as const,
          category: "run" as const,
          intervals: [
            {
              id: "20000000-0000-4000-8000-000000000001",
              name: "Run",
              repetitions: 1,
              steps: [step("30000000-0000-4000-8000-000000000001")],
            },
          ],
        },
        {
          id: "10000000-0000-4000-8000-000000000002",
          name: "Bike",
          role: "activity" as const,
          category: "bike" as const,
          intervals: [
            {
              id: "20000000-0000-4000-8000-000000000002",
              name: "Bike",
              repetitions: 1,
              steps: [step("30000000-0000-4000-8000-000000000002")],
            },
          ],
        },
        {
          id: "10000000-0000-4000-8000-000000000003",
          name: "Run two",
          role: "activity" as const,
          category: "run" as const,
          intervals: [
            {
              id: "20000000-0000-4000-8000-000000000003",
              name: "Run",
              repetitions: 1,
              steps: [step("30000000-0000-4000-8000-000000000003")],
            },
          ],
        },
      ],
    };

    expect(getPlanCategoryComposition(structure)).toEqual(["run", "bike", "run"]);
  });
});
