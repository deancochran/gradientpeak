import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { NativePicker } from "../native-picker/index.native";
import { Text } from "../text/index.native";
import { choiceFieldFixtures } from "./fixtures";
import { ChoiceField, type ChoiceFieldProps } from "./index.native";

function ControlledChoice(args: ChoiceFieldProps<string>) {
  const [value, setValue] = useState(args.value);
  return (
    <ChoiceField {...args} value={value} onChange={setValue} onClear={() => setValue(undefined)} />
  );
}
const meta = {
  title: "Inputs/ChoiceField",
  component: ChoiceField<string>,
  args: { ...choiceFieldFixtures.progression, onChange: () => {} },
  decorators: [
    (Story) => (
      <View className="flex-1 gap-4 bg-background p-4">
        <Story />
        <Text>
          Short pairs use native segments; small fields open a native popup directly. Panels show
          native choices immediately, and larger sets use a searchable list. Requires @expo/ui
          57.0.19. Mock-host tests do not prove device accessibility or sizing.
        </Text>
      </View>
    ),
  ],
  render: (args) => <ControlledChoice {...args} />,
} satisfies Meta<typeof ChoiceField<string>>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Optional: Story = {};
export const Empty: Story = { args: choiceFieldFixtures.empty };
export const Unavailable: Story = { args: choiceFieldFixtures.unavailable };
export const Disabled: Story = { args: { disabled: true } };
export const Required: Story = { args: { ...choiceFieldFixtures.empty, required: true } };
export const BinarySegments: Story = {
  args: { ...choiceFieldFixtures.binary, nativePresentation: "segmented" },
};
export const DirectPopup: Story = { args: { nativePresentation: "menu" } };
export const ExistingPanel: Story = { args: { presentation: "panel" } };
export const SearchableCatalog: Story = { args: choiceFieldFixtures.catalog };
export const LongLabels: Story = {
  args: {
    nativePresentation: "segmented",
    options: [
      { value: "balanced", label: "Keep existing values and preserve the previous selection" },
      { value: "other", label: "Choose a different objective for this training period" },
    ],
  },
};
export const PlatformComparison: Story = {
  render: (args) => (
    <View className="gap-4">
      <ControlledChoice {...args} presentation="panel" />
      <Text>Retained numeric wheel backend (focusable RNPicker)</Text>
      <NativePicker
        label="Numeric wheel comparison"
        value={2}
        options={[
          { value: 1, label: "1" },
          { value: 2, label: "2" },
        ]}
        onChange={() => {}}
      />
    </View>
  ),
};
