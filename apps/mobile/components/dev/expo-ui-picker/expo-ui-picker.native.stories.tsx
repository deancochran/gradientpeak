import { Text } from "@repo/ui/components/text";
import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { ExpoUiPickerDemo } from "./ExpoUiPickerDemo";

const meta = {
  title: "Inputs/NativePickerAssessment",
  component: ExpoUiPickerDemo,
  decorators: [
    (Story) => (
      <View className="flex-1 gap-6 bg-background p-6">
        <Text className="text-xl font-semibold">Expo UI native foundation</Text>
        <Text>
          Local demo only. Select Easy, Steady, or Hard and check that the readout follows the
          native control. Compare with Inputs/NativePicker in this catalog.
        </Text>
        <Story />
        <Text className="text-sm text-muted-foreground">
          Requires a development binary containing @expo/ui 57.0.19. Source checks do not verify
          native rendering, touch behavior, or accessibility.
        </Text>
      </View>
    ),
  ],
} satisfies Meta<typeof ExpoUiPickerDemo>;

export default meta;
type Story = StoryObj<typeof meta>;
export const ExpoUIFoundation: Story = {};
