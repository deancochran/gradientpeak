import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderWeb, screen } from "../../test/render-web";
import { Label } from "../label/index.web";
import { radioGroupFixtures } from "./fixtures";
import { RadioGroup, RadioGroupItem } from "./index.web";

describe("RadioGroup web", () => {
  it("maps normalized test props and forwards value changes", () => {
    const onValueChange = vi.fn();

    renderWeb(
      <RadioGroup
        defaultValue={radioGroupFixtures.activityCategory.value}
        id={radioGroupFixtures.activityCategory.id}
        onValueChange={onValueChange}
        testId={radioGroupFixtures.activityCategory.testId}
      >
        {radioGroupFixtures.activityCategory.options.map((option) => (
          <div key={option.value}>
            <RadioGroupItem
              id={`${radioGroupFixtures.activityCategory.id}-${option.value}`}
              value={option.value}
            />
            <Label htmlFor={`${radioGroupFixtures.activityCategory.id}-${option.value}`}>
              {option.label}
            </Label>
          </div>
        ))}
      </RadioGroup>,
    );

    const group = screen.getByTestId(radioGroupFixtures.activityCategory.testId);
    expect(group).toHaveAttribute("id", radioGroupFixtures.activityCategory.id);

    fireEvent.click(screen.getByRole("radio", { name: "Run" }));

    expect(onValueChange).toHaveBeenCalledWith("run");
  });
});
