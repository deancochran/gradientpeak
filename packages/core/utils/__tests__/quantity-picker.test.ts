import { describe, expect, it } from "vitest";
import {
  quantityPickerWholeGroups,
  quantityPickerWholeGroupValue,
  quantityPickerWholeValue,
} from "../numeric-ux-policy";

describe("quantity picker grouping", () => {
  it("keeps large finite ranges reachable through compact semantic groups", () => {
    const groups = quantityPickerWholeGroups(2_000_000);
    expect(groups.map((group) => group.label)).toEqual(["millions", "thousands", "units"]);
    expect(groups.map((group) => group.values.length)).toEqual([3, 1_000, 1_000]);
    const values = groups.map((group) => quantityPickerWholeGroupValue(42_195, group.divisor));
    expect(values).toEqual([0, 42, 195]);
    expect(quantityPickerWholeValue(values, groups)).toBe(42_195);
  });

  it("rejects unsafe group composition instead of overflowing", () => {
    expect(() => quantityPickerWholeGroups(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
    expect(quantityPickerWholeValue([1], quantityPickerWholeGroups(2_000))).toBeNaN();
  });
});
