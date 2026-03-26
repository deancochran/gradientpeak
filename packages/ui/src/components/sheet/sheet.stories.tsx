import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "@storybook/test";

import { Button } from "../button/index.web";
import { Checkbox } from "../checkbox/index.web";
import { Label } from "../label/index.web";
import { sheetFixtures } from "./fixtures";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./index.web";
import { exerciseSheetStory } from "./interactions";

const meta = {
  title: "Components/Sheet",
  component: Sheet,
  tags: ["autodocs"],
} satisfies Meta<typeof Sheet>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="outline">
          {sheetFixtures.filters.triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent aria-describedby={undefined} side="right">
        <SheetHeader>
          <SheetTitle>{sheetFixtures.filters.title}</SheetTitle>
          <SheetDescription>{sheetFixtures.filters.description}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4">
          <div className="flex items-center gap-3">
            <Checkbox id="only-starred" />
            <Label htmlFor="only-starred">Only starred workouts</Label>
          </div>
          <div className="flex items-center gap-3">
            <Checkbox id="show-completed" />
            <Label htmlFor="show-completed">Include completed sessions</Label>
          </div>
        </div>
        <SheetFooter>
          <Button type="button">Apply filters</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
  play: async ({ canvasElement }) => {
    const { sheet } = await exerciseSheetStory({
      canvasElement,
      closeLabel: sheetFixtures.filters.closeLabel,
      triggerLabel: sheetFixtures.filters.triggerLabel,
    });

    await expect(sheet).not.toBeVisible();
  },
};
