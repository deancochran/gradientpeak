import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderWeb, screen } from "../../test/render-web";
import { toggleGroupFixtures } from "./fixtures";
import { ToggleGroup, ToggleGroupItem } from "./index.web";

describe("ToggleGroup web", () => {
  it("maps normalized test props for the root and items", () => {
    const onValueChange = vi.fn();
    const firstOption = toggleGroupFixtures.viewMode.options[0]!;
    const secondOption = toggleGroupFixtures.viewMode.options[1]!;

    renderWeb(
      <ToggleGroup
        aria-label={toggleGroupFixtures.viewMode.ariaLabel}
        onValueChange={onValueChange}
        testId={toggleGroupFixtures.viewMode.rootTestId}
        type="single"
        value={toggleGroupFixtures.viewMode.value}
      >
        <ToggleGroupItem testId={firstOption.testId} value={firstOption.value}>
          {firstOption.label}
        </ToggleGroupItem>
        <ToggleGroupItem testId={secondOption.testId} value={secondOption.value}>
          {secondOption.label}
        </ToggleGroupItem>
      </ToggleGroup>,
    );

    expect(screen.getByTestId(toggleGroupFixtures.viewMode.rootTestId)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: firstOption.label })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("radio", { name: secondOption.label }));
    expect(onValueChange).toHaveBeenCalledWith(secondOption.value);
  });
});
