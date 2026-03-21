import type { Meta, StoryObj } from "@storybook/react";
import { Bell, CircleAlert, Info, LayoutGrid, Settings2 } from "lucide-react";
import { ThemeProvider } from "next-themes";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/accordion/index.web";
import * as AlertDialog from "../components/alert-dialog/index.web";
import { Button } from "../components/button/index.web";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "../components/command/index.web";
import * as Dialog from "../components/dialog/index.web";
import * as DropdownMenu from "../components/dropdown-menu/index.web";
import * as Form from "../components/form/index.web";
import { Icon } from "../components/icon/index.web";
import { Input } from "../components/input/index.web";
import * as NavigationMenu from "../components/navigation-menu/index.web";
import * as Resizable from "../components/resizable/index.web";
import * as ScrollArea from "../components/scroll-area/index.web";
import { Separator } from "../components/separator/index.web";
import * as Sheet from "../components/sheet/index.web";
import { Toaster } from "../components/sonner/index.web";
import * as Table from "../components/table/index.web";
import { Toggle } from "../components/toggle/index.web";
import { ToggleGroup, ToggleGroupItem } from "../components/toggle-group/index.web";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip/index.web";

const meta = {
  title: "Catalog/Web Coverage",
  parameters: {
    layout: "centered",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const ResizablePanelGroup = Resizable.ResizablePanelGroup as React.ComponentType<any>;

function WebFrame({ children }: { children: React.ReactNode }) {
  return <div className="min-w-[320px] max-w-3xl p-6">{children}</div>;
}

function WebFormExample() {
  const form = useForm({
    defaultValues: {
      email: "coach@gradientpeak.app",
    },
  });

  return (
    <Form.Form {...form}>
      <form className="w-80 space-y-4" onSubmit={(event) => event.preventDefault()}>
        <Form.FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <Form.FormItem>
              <Form.FormLabel>Email</Form.FormLabel>
              <Form.FormControl>
                <Input {...field} />
              </Form.FormControl>
              <Form.FormDescription>Used for plan delivery updates.</Form.FormDescription>
              <Form.FormMessage />
            </Form.FormItem>
          )}
        />
      </form>
    </Form.Form>
  );
}

export const AccordionStory: Story = {
  name: "Accordion",
  render: () => (
    <WebFrame>
      <Accordion className="w-full" collapsible type="single">
        <AccordionItem value="training-zones">
          <AccordionTrigger>Training zones</AccordionTrigger>
          <AccordionContent>
            Build thresholds, recovery targets, and workout defaults from one shared primitive.
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </WebFrame>
  ),
};

export const AlertDialogStory: Story = {
  name: "Alert Dialog",
  render: () => (
    <WebFrame>
      <AlertDialog.AlertDialog open>
        <AlertDialog.AlertDialogContent>
          <AlertDialog.AlertDialogHeader>
            <AlertDialog.AlertDialogTitle>Discard unsaved changes?</AlertDialog.AlertDialogTitle>
            <AlertDialog.AlertDialogDescription>
              This keeps your training plan draft unchanged until you explicitly save it.
            </AlertDialog.AlertDialogDescription>
          </AlertDialog.AlertDialogHeader>
          <AlertDialog.AlertDialogFooter>
            <AlertDialog.AlertDialogCancel>Keep editing</AlertDialog.AlertDialogCancel>
            <AlertDialog.AlertDialogAction>Discard draft</AlertDialog.AlertDialogAction>
          </AlertDialog.AlertDialogFooter>
        </AlertDialog.AlertDialogContent>
      </AlertDialog.AlertDialog>
    </WebFrame>
  ),
};

export const CommandStory: Story = {
  name: "Command",
  render: () => (
    <WebFrame>
      <Command className="rounded-lg border shadow-sm">
        <CommandInput placeholder="Search workouts, routes, and inputs" />
        <CommandList>
          <CommandEmpty>No matching components.</CommandEmpty>
          <CommandGroup heading="Inputs">
            <CommandItem>Duration input</CommandItem>
            <CommandItem>Pace input</CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Overlays">
            <CommandItem>Dialog</CommandItem>
            <CommandItem>Sheet</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </WebFrame>
  ),
};

export const DialogStory: Story = {
  name: "Dialog",
  render: () => (
    <WebFrame>
      <Dialog.Dialog open>
        <Dialog.DialogContent>
          <Dialog.DialogHeader>
            <Dialog.DialogTitle>Plan settings</Dialog.DialogTitle>
            <Dialog.DialogDescription>
              Preview a fully mounted dialog implementation without leaving Storybook.
            </Dialog.DialogDescription>
          </Dialog.DialogHeader>
          <Dialog.DialogFooter showCloseButton>
            <Button>Save preferences</Button>
          </Dialog.DialogFooter>
        </Dialog.DialogContent>
      </Dialog.Dialog>
    </WebFrame>
  ),
};

export const DropdownMenuStory: Story = {
  name: "Dropdown Menu",
  render: () => (
    <WebFrame>
      <DropdownMenu.DropdownMenu open>
        <DropdownMenu.DropdownMenuTrigger asChild>
          <Button variant="outline">Open menu</Button>
        </DropdownMenu.DropdownMenuTrigger>
        <DropdownMenu.DropdownMenuContent>
          <DropdownMenu.DropdownMenuLabel>Workout actions</DropdownMenu.DropdownMenuLabel>
          <DropdownMenu.DropdownMenuItem>Duplicate session</DropdownMenu.DropdownMenuItem>
          <DropdownMenu.DropdownMenuCheckboxItem checked>
            Show on calendar
          </DropdownMenu.DropdownMenuCheckboxItem>
          <DropdownMenu.DropdownMenuSeparator />
          <DropdownMenu.DropdownMenuItem variant="destructive">
            Delete workout
          </DropdownMenu.DropdownMenuItem>
        </DropdownMenu.DropdownMenuContent>
      </DropdownMenu.DropdownMenu>
    </WebFrame>
  ),
};

export const FormStory: Story = {
  name: "Form",
  render: () => (
    <WebFrame>
      <WebFormExample />
    </WebFrame>
  ),
};

export const IconStory: Story = {
  name: "Icon",
  render: () => (
    <WebFrame>
      <div className="flex items-center gap-4">
        <Icon as={Bell} className="size-5" />
        <Icon as={Info} className="size-5 text-muted-foreground" />
        <Icon as={CircleAlert} className="size-5 text-destructive" />
      </div>
    </WebFrame>
  ),
};

export const NavigationMenuStory: Story = {
  name: "Navigation Menu",
  render: () => (
    <WebFrame>
      <NavigationMenu.NavigationMenu viewport={false}>
        <NavigationMenu.NavigationMenuList>
          <NavigationMenu.NavigationMenuItem>
            <NavigationMenu.NavigationMenuTrigger>Training</NavigationMenu.NavigationMenuTrigger>
            <NavigationMenu.NavigationMenuContent>
              <div className="grid w-[320px] gap-2 p-3">
                <NavigationMenu.NavigationMenuLink href="#">
                  Build weekly structure
                </NavigationMenu.NavigationMenuLink>
                <NavigationMenu.NavigationMenuLink href="#">
                  Review readiness inputs
                </NavigationMenu.NavigationMenuLink>
              </div>
            </NavigationMenu.NavigationMenuContent>
          </NavigationMenu.NavigationMenuItem>
        </NavigationMenu.NavigationMenuList>
      </NavigationMenu.NavigationMenu>
    </WebFrame>
  ),
};

export const ResizableStory: Story = {
  name: "Resizable",
  render: () => (
    <WebFrame>
      <div className="h-56 w-full rounded-lg border">
        <ResizablePanelGroup direction="horizontal">
          <Resizable.ResizablePanel defaultSize={45}>
            <div className="flex h-full items-center justify-center bg-muted/40">Plan summary</div>
          </Resizable.ResizablePanel>
          <Resizable.ResizableHandle withHandle />
          <Resizable.ResizablePanel defaultSize={55}>
            <div className="flex h-full items-center justify-center">Projected volume</div>
          </Resizable.ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </WebFrame>
  ),
};

export const ScrollAreaStory: Story = {
  name: "Scroll Area",
  render: () => (
    <WebFrame>
      <ScrollArea.ScrollArea className="h-48 w-72 rounded-md border">
        <div className="space-y-2 p-4">
          {Array.from({ length: 10 }, (_, index) => (
            <div className="rounded-md bg-muted px-3 py-2 text-sm" key={`web-scroll-${index + 1}`}>
              Component fixture {index + 1}
            </div>
          ))}
        </div>
      </ScrollArea.ScrollArea>
    </WebFrame>
  ),
};

export const SeparatorStory: Story = {
  name: "Separator",
  render: () => (
    <WebFrame>
      <div className="w-72 space-y-3">
        <div>Warm-up</div>
        <Separator />
        <div>Threshold set</div>
      </div>
    </WebFrame>
  ),
};

export const SheetStory: Story = {
  name: "Sheet",
  render: () => (
    <WebFrame>
      <Sheet.Sheet open>
        <Sheet.SheetContent>
          <Sheet.SheetHeader>
            <Sheet.SheetTitle>Workout library</Sheet.SheetTitle>
            <Sheet.SheetDescription>
              Review shared controls in the same slide-over used by the app.
            </Sheet.SheetDescription>
          </Sheet.SheetHeader>
          <Sheet.SheetFooter>
            <Button>Add workout</Button>
          </Sheet.SheetFooter>
        </Sheet.SheetContent>
      </Sheet.Sheet>
    </WebFrame>
  ),
};

export const SonnerStory: Story = {
  name: "Sonner",
  render: () => (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <WebFrame>
        <div className="flex items-center gap-3">
          <Button onClick={() => toast.success("Toast preview from Storybook")}>
            Trigger toast
          </Button>
          <Toaster richColors />
        </div>
      </WebFrame>
    </ThemeProvider>
  ),
};

export const TableStory: Story = {
  name: "Table",
  render: () => (
    <WebFrame>
      <Table.Table>
        <Table.TableHeader>
          <Table.TableRow>
            <Table.TableHead>Session</Table.TableHead>
            <Table.TableHead>Status</Table.TableHead>
          </Table.TableRow>
        </Table.TableHeader>
        <Table.TableBody>
          <Table.TableRow>
            <Table.TableCell>Tempo Run</Table.TableCell>
            <Table.TableCell>Ready</Table.TableCell>
          </Table.TableRow>
        </Table.TableBody>
      </Table.Table>
    </WebFrame>
  ),
};

export const ToggleStory: Story = {
  name: "Toggle",
  render: () => (
    <WebFrame>
      <Toggle defaultPressed variant="outline">
        <Settings2 className="size-4" />
        Auto-adjust
      </Toggle>
    </WebFrame>
  ),
};

export const ToggleGroupStory: Story = {
  name: "Toggle Group",
  render: () => (
    <WebFrame>
      <ToggleGroup defaultValue="grid" type="single" variant="outline">
        <ToggleGroupItem value="grid">
          <LayoutGrid className="size-4" />
          Grid
        </ToggleGroupItem>
        <ToggleGroupItem value="list">List</ToggleGroupItem>
      </ToggleGroup>
    </WebFrame>
  ),
};

export const TooltipStory: Story = {
  name: "Tooltip",
  render: () => (
    <WebFrame>
      <Tooltip open>
        <TooltipTrigger asChild>
          <Button variant="outline">Hover target</Button>
        </TooltipTrigger>
        <TooltipContent>Shared tooltip copy preview</TooltipContent>
      </Tooltip>
    </WebFrame>
  ),
};
