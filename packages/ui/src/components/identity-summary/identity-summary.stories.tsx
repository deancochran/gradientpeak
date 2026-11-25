import type { Meta, StoryObj } from "@storybook/react-vite";
import { identitySummaryFixtures } from "./fixtures";
import { IdentitySummary } from "./index.web";

const meta = {
  title: "Components/IdentitySummary",
  component: IdentitySummary,
} satisfies Meta<typeof IdentitySummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AssignedAthlete: Story = { args: identitySummaryFixtures.assignedAthlete };
export const LongIdentity: Story = { args: identitySummaryFixtures.longIdentity };
