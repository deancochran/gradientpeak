import type { Meta, StoryObj } from "@storybook/react-vite";
import { trainingStateChartFixtures } from "./fixtures";
import { TrainingStateChart } from "./index.web";

const meta = {
  title: "Components/TrainingStateChart",
  component: TrainingStateChart,
  args: {
    emptyMessage: "Training state is unavailable for this period.",
    metric: "fitness",
    source: "recorded",
    title: "Historical Fitness",
    visual: trainingStateChartFixtures.mixedSeries,
  },
} satisfies Meta<typeof TrainingStateChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const MixedRecordedAndProjected: Story = {};
