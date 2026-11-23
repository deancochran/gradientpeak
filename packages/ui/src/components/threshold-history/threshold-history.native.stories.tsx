import type { Meta, StoryObj } from "@storybook/react-native";
import { thresholdHistoryFixtures } from "./fixtures";
import { ThresholdHistoryChart } from "./index.native";

const meta = {
  title: "Components/ThresholdHistory",
  component: ThresholdHistoryChart,
  args: {
    emptyMessage: "No calculated threshold values are available.",
    series: thresholdHistoryFixtures.bikePower,
  },
} satisfies Meta<typeof ThresholdHistoryChart>;

export default meta;
type Story = StoryObj<typeof meta>;
export const BikePower: Story = {};
