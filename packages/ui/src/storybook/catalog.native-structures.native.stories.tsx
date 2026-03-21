import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { View } from "react-native";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/accordion/index.native";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/alert-dialog/index.native";
import { AspectRatio } from "../components/aspect-ratio/index.native";
import { Button } from "../components/button/index.native";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../components/collapsible/index.native";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../components/context-menu/index.native";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/dialog/index.native";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/dropdown-menu/index.native";
import * as Form from "../components/form/index.native";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../components/hover-card/index.native";
import { Input } from "../components/input/index.native";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "../components/menubar/index.native";
import { NativeOnlyAnimatedView } from "../components/native-only-animated-view/index.native";
import { Popover, PopoverContent, PopoverTrigger } from "../components/popover/index.native";
import { Text } from "../components/text/index.native";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip/index.native";

const meta = {
  title: "Catalog/Native Structures",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

function NativeFrame({ children }: { children: React.ReactNode }) {
  return <View className="min-w-[320px] gap-4 bg-background p-6">{children}</View>;
}

function NativeFormExample() {
  const form = useForm({
    defaultValues: {
      email: "runner@gradientpeak.app",
    },
  });

  return (
    <Form.Form {...form}>
      <Form.FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <Form.FormItem>
            <Form.FormLabel>Email</Form.FormLabel>
            <Form.FormControl>
              <Input
                accessibilityLabel="storybook-email"
                onChangeText={field.onChange}
                value={field.value}
              />
            </Form.FormControl>
            <Form.FormDescription>Shared field wiring stays portable.</Form.FormDescription>
            <Form.FormMessage />
          </Form.FormItem>
        )}
      />
    </Form.Form>
  );
}

export const AccordionStory: Story = {
  name: "Accordion",
  render: () => (
    <NativeFrame>
      <Accordion collapsible type="single" value="zones">
        <AccordionItem value="zones">
          <AccordionTrigger>
            <Text>Training zones</Text>
          </AccordionTrigger>
          <AccordionContent>
            <Text>Inspect the native trigger, animation, and content composition together.</Text>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </NativeFrame>
  ),
};

export const AlertDialogStory: Story = {
  name: "Alert Dialog",
  render: () => (
    <NativeFrame>
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard workout draft?</AlertDialogTitle>
            <AlertDialogDescription>
              Leave Storybook with a fully mounted destructive dialog example.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>Keep editing</Text>
            </AlertDialogCancel>
            <AlertDialogAction>
              <Text>Discard</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </NativeFrame>
  ),
};

export const AspectRatioStory: Story = {
  name: "Aspect Ratio",
  render: () => (
    <NativeFrame>
      <AspectRatio ratio={16 / 9}>
        <View className="flex-1 items-center justify-center rounded-lg bg-muted">
          <Text>16:9</Text>
        </View>
      </AspectRatio>
    </NativeFrame>
  ),
};

export const CollapsibleStory: Story = {
  name: "Collapsible",
  render: () => (
    <NativeFrame>
      <Collapsible defaultOpen>
        <CollapsibleTrigger>
          <Button>
            <Text>Toggle details</Text>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Text className="pt-3">Expanded content remains visible for interaction checks.</Text>
        </CollapsibleContent>
      </Collapsible>
    </NativeFrame>
  ),
};

export const ContextMenuStory: Story = {
  name: "Context Menu",
  render: () => (
    <NativeFrame>
      <ContextMenu>
        <ContextMenuTrigger>
          <Button variant="outline">
            <Text>Open context menu</Text>
          </Button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>
            <Text>Duplicate block</Text>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </NativeFrame>
  ),
};

export const DialogStory: Story = {
  name: "Dialog",
  render: () => (
    <NativeFrame>
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Plan settings</DialogTitle>
            <DialogDescription>Validate the native modal shell and spacing.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button>
              <Text>Save</Text>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </NativeFrame>
  ),
};

export const DropdownMenuStory: Story = {
  name: "Dropdown Menu",
  render: () => (
    <NativeFrame>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button variant="outline">
            <Text>Open actions</Text>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>
            <Text>Schedule workout</Text>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </NativeFrame>
  ),
};

export const FormStory: Story = {
  name: "Form",
  render: () => (
    <NativeFrame>
      <NativeFormExample />
    </NativeFrame>
  ),
};

export const HoverCardStory: Story = {
  name: "Hover Card",
  render: () => (
    <NativeFrame>
      <HoverCard>
        <HoverCardTrigger>
          <Button variant="outline">
            <Text>Preview athlete</Text>
          </Button>
        </HoverCardTrigger>
        <HoverCardContent>
          <Text>On-device hover-card content renders through the same shared package surface.</Text>
        </HoverCardContent>
      </HoverCard>
    </NativeFrame>
  ),
};

export const MenubarStory: Story = {
  name: "Menubar",
  render: () => (
    <NativeFrame>
      <Menubar onValueChange={() => {}} value="training">
        <MenubarMenu value="training">
          <MenubarTrigger>
            <Text>Training</Text>
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem>
              <Text>Open planner</Text>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    </NativeFrame>
  ),
};

export const NativeOnlyAnimatedViewStory: Story = {
  name: "Native Only Animated View",
  render: () => (
    <NativeFrame>
      <NativeOnlyAnimatedView className="rounded-lg bg-muted p-4">
        <Text>Animation host renders on native without changing the public surface.</Text>
      </NativeOnlyAnimatedView>
    </NativeFrame>
  ),
};

export const PopoverStory: Story = {
  name: "Popover",
  render: () => (
    <NativeFrame>
      <Popover>
        <PopoverTrigger>
          <Button variant="outline">
            <Text>Open popover</Text>
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          <Text>Popover content is mounted for interaction and visual checks.</Text>
        </PopoverContent>
      </Popover>
    </NativeFrame>
  ),
};

export const TooltipStory: Story = {
  name: "Tooltip",
  render: () => (
    <NativeFrame>
      <Tooltip>
        <TooltipTrigger>
          <Button variant="outline">
            <Text>Tooltip target</Text>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <Text>Native tooltip content</Text>
        </TooltipContent>
      </Tooltip>
    </NativeFrame>
  ),
};
