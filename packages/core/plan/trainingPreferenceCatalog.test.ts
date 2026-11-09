import { describe, expect, it } from "vitest";
import { trainingPlanPreferencesSchema } from "./trainingPlanPreferences";
import {
  trainingPlanPreferenceFieldSchema,
  trainingPreferenceCatalog,
} from "./trainingPreferenceCatalog";

describe("trainingPreferenceCatalog", () => {
  it("contains exactly the supported plan-owned preference controls", () => {
    expect(trainingPreferenceCatalog.map((field) => field.key).sort()).toEqual(
      Object.keys(trainingPlanPreferencesSchema.shape).sort(),
    );
    expect(() =>
      trainingPreferenceCatalog.map((field) => trainingPlanPreferenceFieldSchema.parse(field)),
    ).not.toThrow();
  });

  it("does not retain profile or global preference semantics", () => {
    expect(trainingPreferenceCatalog).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "durationWeeks" }),
        expect.objectContaining({ globalPath: expect.anything() }),
      ]),
    );
  });
});
