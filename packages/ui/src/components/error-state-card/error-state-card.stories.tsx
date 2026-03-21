import type { Meta, StoryObj } from "@storybook/react";

import { errorStateCardFixtures } from "./fixtures";
import { ErrorMessage, ErrorStateCard } from "./index.web";

const meta = {
  title: "Components/ErrorStateCard",
  component: ErrorStateCard,
  tags: ["autodocs"],
  args: {
    ...errorStateCardFixtures.generic,
    onRetry: () => {},
  },
} satisfies Meta<typeof ErrorStateCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Card: Story = {};

export const Inline: Story = {
  render: () => <ErrorMessage {...errorStateCardFixtures.inline} onRetry={() => {}} />,
};
