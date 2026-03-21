import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderWeb, screen } from "../../test/render-web";
import { toggleGroupFixtures } from "./fixtures";
import { ToggleGroup, ToggleGroupItem } from "./index.web";

describe("ToggleGroup web", () => {
  it("maps normalized test props for the root and items", () => {
    const onValueChange = vi.fn();

    renderWeb(
      <ToggleGroup
        aria-label={toggleGroupFixtures.viewMode.ariaLabel}
        onValueChange={onValueChange}
        testId={toggleGroupFixtures.viewMode.rootTestId}
        type="single"
        value={toggleGroupFixtures.viewMode.value}
      >
        <ToggleGroupItem
          testId={toggleGroupFixtures.viewMode.options[0]!.testId}
          value={toggleGroupFixtures.viewMode.options[0]!.value}
        >
          {toggleGroupFixtures.viewMode.options[0]!.label}
        </ToggleGroupItem>
        <ToggleGroupItem
          testId={toggleGroupFixtures.viewMode.options[1]!.testId}
          value={toggleGroupFixtures.viewMode.options[1]!.value}
        >
          {toggleGroupFixtures.viewMode.options[1]!.label}
        </ToggleGroupItem>
      </ToggleGroup>,
    );

    expect(screen.getByTestId(toggleGroupFixtures.viewMode.rootTestId)).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: toggleGroupFixtures.viewMode.options[0]!.label }),
    ).toHaveAttribute("aria-checked", "true");
    fireEvent.click(
      screen.getByRole("radio", { name: toggleGroupFixtures.viewMode.options[1]!.label }),
    );
    expect(onValueChange).toHaveBeenCalledWith(toggleGroupFixtures.viewMode.options[1]!.value);
  });
});
