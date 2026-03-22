import { describe, expect, it } from "vitest";

import { fireEvent, renderWeb, screen } from "../../test/render-web";
import { selectFixtures } from "./fixtures";
import {
  NativeSelectScrollView,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./index.web";

describe("Select web", () => {
  it("renders trigger text and option content", async () => {
    renderWeb(
      <Select defaultValue={selectFixtures.workoutType.value}>
        <SelectTrigger>
          <SelectValue placeholder={selectFixtures.workoutType.placeholder} />
        </SelectTrigger>
        <SelectContent>
          <NativeSelectScrollView>
            {selectFixtures.workoutType.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </NativeSelectScrollView>
        </SelectContent>
      </Select>,
    );

    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("Tempo");

    fireEvent.click(trigger);

    expect(await screen.findByText("Threshold")).toBeInTheDocument();
  });
});
