import { describe, expect, it } from "vitest";

import {
  normalizeLinkedActivityPlanId,
  normalizeSystemActivityTemplateId,
  normalizeSystemRouteTemplateId,
} from "../template-ids";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("system template identifiers", () => {
  it("preserves valid RFC 4122 UUIDs", () => {
    expect(
      normalizeSystemActivityTemplateId({
        id: UUID,
        activityCategory: "run",
        name: "Easy run",
      }),
    ).toBe(UUID);
    expect(normalizeLinkedActivityPlanId(UUID)).toBe(UUID);
    expect(normalizeSystemRouteTemplateId({ id: UUID, name: "Route" })).toBe(UUID);
  });

  it("rejects malformed and non-UUID identifiers instead of translating them", () => {
    expect(() =>
      normalizeSystemActivityTemplateId({
        id: "11111111-1111-1111-1111-111111111111",
        activityCategory: "run",
        name: "Easy run",
      }),
    ).toThrow("RFC 4122 UUID");
    expect(() => normalizeLinkedActivityPlanId("legacy-template-id")).toThrow("RFC 4122 UUID");
    expect(() => normalizeSystemRouteTemplateId({ id: "legacy-route-id", name: "Route" })).toThrow(
      "RFC 4122 UUID",
    );
  });
});
