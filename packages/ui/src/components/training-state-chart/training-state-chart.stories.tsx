import type { Meta, StoryObj } from "@storybook/react-vite";
import { trainingStateChartFixtures } from "./fixtures";
import { TrainingStateLegend } from "./index.web";

const meta = {
  title: "Components/TrainingStateChart",
  component: TrainingStateLegend,
  args: trainingStateChartFixtures.mixedSeries,
} satisfies Meta<typeof TrainingStateLegend>;

export default meta;

type Story = StoryObj<typeof meta>;

export const MixedRecordedAndProjected: Story = {};
