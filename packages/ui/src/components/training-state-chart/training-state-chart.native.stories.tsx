import type { Meta, StoryObj } from "@storybook/react-native";
import { trainingStateChartFixtures } from "./fixtures";
import { TrainingStateChart } from "./index.native";

const meta = {
  title: "Components/TrainingStateChart/Native",
  component: TrainingStateChart,
  args: {
    emptyMessage: "Training state is unavailable for this period.",
    colors: trainingStateChartFixtures.mixedSeries.colors,
    series: [
      { metric: "fitness", source: "recorded" },
      { metric: "fatigue", source: "recorded" },
      { metric: "form", source: "recorded" },
      { metric: "fitness", source: "projected" },
      { metric: "fatigue", source: "projected" },
      { metric: "form", source: "projected" },
    ],
    visual: trainingStateChartFixtures.mixedSeries,
  },
} satisfies Meta<typeof TrainingStateChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const MixedRecordedAndProjected: Story = {
  render: (args) => <TrainingStateChart {...args} />,
};
