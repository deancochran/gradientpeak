import { describe, expect, it } from "vitest";
import { hasWahooRouteMirrorScopes } from "./planned-activity-scopes";

describe("Wahoo route mirror admission", () => {
  it("stays disabled even when a legacy grant contains every route scope", () => {
    expect(hasWahooRouteMirrorScopes("routes_read routes_write offline_data")).toBe(false);
  });
});
