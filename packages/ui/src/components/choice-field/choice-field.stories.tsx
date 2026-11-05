import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { choiceFieldFixtures } from "./fixtures";
import { ChoiceField, type ChoiceFieldProps } from "./index.web";

function ControlledChoice(args: ChoiceFieldProps<string>) {
  const [value, setValue] = useState(args.value);
  return (
    <ChoiceField {...args} value={value} onChange={setValue} onClear={() => setValue(undefined)} />
  );
}
const meta = {
  title: "Inputs/ChoiceField",
  component: ChoiceField<string>,
  args: { ...choiceFieldFixtures.progression, onChange: () => {} },
  render: (args) => <ControlledChoice {...args} />,
} satisfies Meta<typeof ChoiceField<string>>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Optional: Story = {};
export const Empty: Story = { args: choiceFieldFixtures.empty };
export const Unavailable: Story = { args: choiceFieldFixtures.unavailable };
export const Disabled: Story = { args: { disabled: true } };
export const Required: Story = { args: { ...choiceFieldFixtures.empty, required: true } };
