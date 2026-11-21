import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { trainingStateChartFixtures } from "./fixtures";
import { TrainingStateChart } from "./index.native";

const meta = {
  title: "Components/TrainingStateChart/Native",
  component: TrainingStateChart,
  args: {
    emptyMessage: "Training state is unavailable for this period.",
    metric: "fitness",
    source: "recorded",
    visual: trainingStateChartFixtures.mixedSeries,
  },
} satisfies Meta<typeof TrainingStateChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const MixedRecordedAndProjected: Story = {
  render: (args) => (
    <View className="bg-background p-6">
      <TrainingStateChart {...args}>
        <View className="flex-1 justify-center gap-4">
          <View className="h-1 rounded-full bg-chart-1" />
          <View className="h-1 rounded-full bg-chart-3 opacity-70" />
          <View className="h-1 rounded-full bg-chart-5 opacity-50" />
        </View>
      </TrainingStateChart>
    </View>
  ),
};
