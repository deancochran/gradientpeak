import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { trainingStateChartFixtures } from "./fixtures";
import { TrainingStateLegend } from "./index.native";

const meta = {
  title: "Components/TrainingStateChart/Native",
  component: TrainingStateLegend,
  args: trainingStateChartFixtures.mixedSeries,
} satisfies Meta<typeof TrainingStateLegend>;

export default meta;

type Story = StoryObj<typeof meta>;

export const MixedRecordedAndProjected: Story = {
  render: (args) => (
    <View className="bg-background p-6">
      <TrainingStateLegend {...args} />
    </View>
  ),
};
