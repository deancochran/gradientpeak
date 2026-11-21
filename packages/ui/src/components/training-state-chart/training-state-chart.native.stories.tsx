import type { Meta, StoryObj } from "@storybook/react-native";
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
  render: (args) => <TrainingStateChart {...args} />,
};
