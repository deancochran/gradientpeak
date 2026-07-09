import { describe, expect, it } from "vitest";
import { planningPreferencesSchema } from "./planningPreferences";
import {
  trainingPreferenceCatalog,
  trainingPreferenceFieldSchema,
  trainingPreferenceTabs,
} from "./trainingPreferenceCatalog";

describe("trainingPreferenceCatalog", () => {
  it("is a parseable canonical field manifest", () => {
    expect(trainingPreferenceCatalog.length).toBeGreaterThan(20);
    expect(() =>
      trainingPreferenceCatalog.map((field) => trainingPreferenceFieldSchema.parse(field)),
    ).not.toThrow();
  });

  it("maps every editable plan-local preference to a real planning schema key", () => {
    const planningKeys = Object.keys(planningPreferencesSchema.shape).sort();
    const editablePlanLocalKeys = trainingPreferenceCatalog
      .filter((field) => field.planLocalSupport === "editable")
      .map((field) => field.planLocalKey)
      .filter((key): key is string => key !== null)
      .sort();

    expect(editablePlanLocalKeys).toEqual(planningKeys);
  });

  it("keeps all tabs represented so global and plan-local sheets share a field order", () => {
    for (const tab of trainingPreferenceTabs) {
      expect(trainingPreferenceCatalog.some((field) => field.tab === tab)).toBe(true);
    }
  });
});
