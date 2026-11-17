import { describe, expect, it, vi } from "vitest";
import { renderWeb, screen } from "../../test/render-web";
import { DateInput } from "./index.web";

describe("DateInput web", () => {
  it("formats date bounds from local calendar values without UTC conversion", () => {
    const localDate = {
      getDate: () => 23,
      getFullYear: () => 2026,
      getMonth: () => 2,
      toISOString: () => {
        throw new Error("UTC formatting must not be used for date-only bounds");
      },
    } as unknown as Date;

    renderWeb(
      <DateInput
        id="date"
        label="Date"
        maximumDate={localDate}
        minimumDate={localDate}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Date");
    expect(input).toHaveAttribute("min", "2026-03-23");
    expect(input).toHaveAttribute("max", "2026-03-23");
  });
});
