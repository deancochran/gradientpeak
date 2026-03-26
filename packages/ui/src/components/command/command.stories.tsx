import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "@storybook/test";

import { commandFixtures } from "./fixtures";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./index.web";
import { exerciseCommandStory } from "./interactions";

const meta = {
  title: "Components/Command",
  component: Command,
  tags: ["autodocs"],
} satisfies Meta<typeof Command>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => (
    <div className="w-[420px] rounded-lg border">
      <Command>
        <CommandInput aria-label={commandFixtures.search.accessibilityLabel} />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem value="create workout">Create workout</CommandItem>
            <CommandItem value="open calendar">Open calendar</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const { input } = await exerciseCommandStory({
      canvasElement,
      query: "calendar",
    });

    await expect(input).toHaveValue("calendar");
  },
};
