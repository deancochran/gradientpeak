import { describe, expect, it } from "vitest";
import { getEffortSourceLabel } from "./index";

describe("getEffortSourceLabel", () => {
  it("renders missing provenance as an explicit unknown source", () => {
    expect(getEffortSourceLabel(null)).toBe("Unknown source");
    expect(getEffortSourceLabel(undefined)).toBe("Unknown source");
    expect(getEffortSourceLabel("manual")).toBe("manual");
  });
});
