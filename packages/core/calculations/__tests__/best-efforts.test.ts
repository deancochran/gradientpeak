import { describe, expect, it } from "vitest";
import { calculateBestEffort } from "../best-efforts";

describe("Best Efforts", () => {
  describe("calculateBestEffort", () => {
    it("should find best 3s effort", () => {
      const s = [10, 10, 10, 20, 20, 20, 10, 10];
      const t = [0, 1, 2, 3, 4, 5, 6, 7];
      const e = calculateBestEffort(s, t, 3);

      expect(e).not.toBeNull();
      expect(e?.value).toBeCloseTo(17.5, 1);
    });
  });
});
