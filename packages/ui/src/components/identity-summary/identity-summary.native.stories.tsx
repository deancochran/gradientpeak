import type { Meta, StoryObj } from "@storybook/react-native";
import { identitySummaryFixtures } from "./fixtures";
import { IdentitySummary } from "./index.native";

const meta = {
  title: "Components/IdentitySummary/Native",
  component: IdentitySummary,
} satisfies Meta<typeof IdentitySummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AssignedAthlete: Story = { args: identitySummaryFixtures.assignedAthlete };
export const LongIdentity: Story = { args: identitySummaryFixtures.longIdentity };
