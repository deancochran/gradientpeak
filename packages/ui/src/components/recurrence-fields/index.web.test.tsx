import { DEFAULT_WEEKLY_COUNT_RECURRENCE } from "@repo/core/recurrence";
import { cleanup } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWeb, screen } from "../../test/render-web";
import { RecurrenceFields } from "./index.web";

afterEach(cleanup);

describe("RecurrenceFields web", () => {
  it("is controlled and keeps occurrence controls within bounds", () => {
    function Harness() {
      const [value, setValue] = useState(DEFAULT_WEEKLY_COUNT_RECURRENCE);
      return <RecurrenceFields onChange={setValue} testIdPrefix="test" value={value} />;
    }

    renderWeb(<Harness />);
    const toggle = screen.getByRole("switch", { name: "Repeat weekly" });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);
    expect(screen.getByTestId("test-repeat-count")).toHaveTextContent("4 occurrences");

    fireEvent.click(screen.getByRole("button", { name: "Decrease occurrence count" }));
    fireEvent.click(screen.getByRole("button", { name: "Decrease occurrence count" }));
    expect(screen.getByTestId("test-repeat-count")).toHaveTextContent("2 occurrences");
    expect(screen.getByRole("button", { name: "Decrease occurrence count" })).toBeDisabled();
  });

  it("connects error text and disables all controls", () => {
    renderWeb(
      <RecurrenceFields
        disabled
        error="Choose a supported count"
        onChange={vi.fn()}
        value={{ ...DEFAULT_WEEKLY_COUNT_RECURRENCE, enabled: true }}
      />,
    );

    const toggle = screen.getByRole("switch", { name: "Repeat weekly" });
    const alert = screen.getByRole("alert");
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("aria-invalid", "true");
    expect(toggle.getAttribute("aria-describedby")).toContain(alert.id);
    expect(screen.getByRole("button", { name: "Increase occurrence count" })).toBeDisabled();
  });
});
