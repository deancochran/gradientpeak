import { BoundedNumberInput } from "@repo/ui/components/bounded-number-input";
import { DateInput as DateField } from "@repo/ui/components/date-input";
import { DurationInput } from "@repo/ui/components/duration-input";
import { IntegerStepper } from "@repo/ui/components/integer-stepper";
import { PaceInput } from "@repo/ui/components/pace-input";
import { PercentSliderInput } from "@repo/ui/components/percent-slider-input";
import { describe, expect, it } from "vitest";

describe("training-plan reusable inputs", () => {
  it("re-exports shared inputs for the composer surface", () => {
    expect(DateField).toBeTypeOf("function");
    expect(BoundedNumberInput).toBeTypeOf("function");
    expect(DurationInput).toBeTypeOf("function");
    expect(PaceInput).toBeTypeOf("function");
    expect(IntegerStepper).toBeTypeOf("function");
  });

  it("uses the shared percent slider input directly", () => {
    expect(PercentSliderInput).toBeTypeOf("function");
  });
});
