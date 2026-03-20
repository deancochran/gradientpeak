import { renderNative } from "../../test/render-native";
import {
  NativeSelectScrollView,
  type Option,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./index.native";

describe("Select native", () => {
  it("renders trigger and option content", () => {
    const tempoOption: Option = {
      label: "Tempo",
      value: "tempo",
    };

    const { getByTestId } = renderNative(
      <Select onValueChange={() => {}} value={tempoOption as never}>
        <SelectTrigger testID="workout-type-trigger">
          <SelectValue placeholder="Choose workout type" />
        </SelectTrigger>
        <SelectContent testID="workout-type-content">
          <NativeSelectScrollView>
            <SelectItem
              label={tempoOption.label}
              testID="tempo-option"
              value={tempoOption.value as never}
            />
          </NativeSelectScrollView>
        </SelectContent>
      </Select>,
    );

    expect(getByTestId("workout-type-trigger")).toBeTruthy();
    expect(getByTestId("workout-type-content")).toBeTruthy();
    expect(getByTestId("tempo-option")).toBeTruthy();
  });
});
