import { PaceSecondsField } from "@repo/ui/components/pace-seconds-field";
import { WeightInputField as SharedWeightInputField } from "@repo/ui/components/weight-input-field";
import { describe, expect, it } from "vitest";
import { WeightInputField } from "../WeightInputField";

describe("profile input wrappers", () => {
  it("re-exports the shared weight input wrapper", () => {
    expect(WeightInputField).toBe(SharedWeightInputField);
  });

  it("uses the shared pace seconds field directly", () => {
    expect(PaceSecondsField).toBeTypeOf("function");
  });
});
