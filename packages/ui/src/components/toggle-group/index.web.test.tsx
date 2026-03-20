import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderWeb, screen } from "../../test/render-web";
import { ToggleGroup, ToggleGroupItem } from "./index.web";

describe("ToggleGroup web", () => {
  it("maps normalized test props for the root and items", () => {
    const onValueChange = vi.fn();

    renderWeb(
      <ToggleGroup
        aria-label="View mode"
        onValueChange={onValueChange}
        testId="view-toggle-group"
        type="single"
        value="grid"
      >
        <ToggleGroupItem testId="view-grid" value="grid">
          Grid
        </ToggleGroupItem>
        <ToggleGroupItem testId="view-list" value="list">
          List
        </ToggleGroupItem>
      </ToggleGroup>,
    );

    expect(screen.getByTestId("view-toggle-group")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Grid" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    expect(onValueChange).toHaveBeenCalledWith("list");
  });
});
