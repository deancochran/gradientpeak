import { describe, expect, it } from "vitest";

import { posthogOptions } from "./telemetry";

describe("web telemetry consent defaults", () => {
  it("denies event capture and persistence until a user opts in", () => {
    expect(posthogOptions.opt_out_capturing_by_default).toBe(true);
    expect(posthogOptions.opt_out_persistence_by_default).toBe(true);
  });
});
