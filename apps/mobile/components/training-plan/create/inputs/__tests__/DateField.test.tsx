import { DateInput } from "@repo/ui/components/date-input";
import { describe, expect, it } from "vitest";
import { DateField } from "../DateField";

describe("DateField", () => {
  it("re-exports the shared date input", () => {
    expect(DateField).toBe(DateInput);
  });
});
