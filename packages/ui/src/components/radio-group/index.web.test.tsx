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
        defaultValue={radioGroupFixtures.sport.value}
        id={radioGroupFixtures.sport.id}
        onValueChange={onValueChange}
        testId={radioGroupFixtures.sport.testId}
      >
        {radioGroupFixtures.sport.options.map((option) => (
          <div key={option.value}>
            <RadioGroupItem
              id={`${radioGroupFixtures.sport.id}-${option.value}`}
              value={option.value}
            />
            <Label htmlFor={`${radioGroupFixtures.sport.id}-${option.value}`}>{option.label}</Label>
          </div>
        ))}
      </RadioGroup>,
    );

    const group = screen.getByTestId(radioGroupFixtures.sport.testId);
    expect(group).toHaveAttribute("id", radioGroupFixtures.sport.id);

    fireEvent.click(screen.getByRole("radio", { name: "Run" }));

    expect(onValueChange).toHaveBeenCalledWith("run");
  });
});
