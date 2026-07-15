import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { SearchField } from "./index.web";

const meta = {
  title: "Components/SearchField",
  component: SearchField,
  args: {
    accessibilityLabel: "Search routes",
    onValueChange: () => {},
    placeholder: "Search routes",
    testId: "search-field-story",
    value: "",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof SearchField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <div className="w-80">
        <SearchField {...args} onValueChange={setValue} value={value} />
      </div>
    );
  },
};

export const Loading: Story = { args: { loading: true, value: "mountain" } };
export const Disabled: Story = { args: { disabled: true, value: "recovery" } };
