import { CircleAlertIcon } from "lucide-react";
import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../test/render-web";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./accordion/index.web";
import * as AlertDialog from "./alert-dialog/index.web";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar/index.web";
import { Badge } from "./badge/index.web";
import * as Dialog from "./dialog/index.web";
import * as DropdownMenu from "./dropdown-menu/index.web";
import * as Form from "./form/index.web";
import { Icon } from "./icon/index.web";
import { Label } from "./label/index.web";
import * as NavigationMenu from "./navigation-menu/index.web";
import * as Resizable from "./resizable/index.web";
import * as ScrollArea from "./scroll-area/index.web";
import { Separator } from "./separator/index.web";
import * as Sheet from "./sheet/index.web";
import * as Sonner from "./sonner/index.web";
import { Switch } from "./switch/index.web";
import * as Table from "./table/index.web";
import { Toggle } from "./toggle/index.web";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group/index.web";
import * as Tooltip from "./tooltip/index.web";

describe("web component coverage", () => {
  it("keeps thin web wrapper exports available", () => {
    expect(Accordion).toBeTypeOf("function");
    expect(AccordionItem).toBeTypeOf("function");
    expect(AccordionTrigger).toBeTypeOf("function");
    expect(AccordionContent).toBeTypeOf("function");
    expect(AlertDialog.AlertDialog).toBeTypeOf("function");
    expect(Dialog.Dialog).toBeTypeOf("function");
    expect(DropdownMenu.DropdownMenu).toBeTypeOf("function");
    expect(Form.Form).toBeTypeOf("function");
    expect(NavigationMenu.NavigationMenu).toBeTypeOf("function");
    expect(Resizable.ResizableHandle).toBeTypeOf("function");
    expect(ScrollArea.ScrollArea).toBeTypeOf("function");
    expect(Sheet.Sheet).toBeTypeOf("function");
    expect(Sonner.Toaster).toBeTypeOf("function");
    expect(Table.Table).toBeTypeOf("function");
    expect(Tooltip.Tooltip).toBeTypeOf("function");
  });

  it("supports normalized test selectors for additional web primitives", () => {
    renderWeb(
      <div>
        <Avatar testId="user-avatar">
          <AvatarImage alt="User avatar" src="/avatar.png" />
          <AvatarFallback>AB</AvatarFallback>
        </Avatar>
        <Badge testId="status-badge">Active</Badge>
        <Label testId="email-label" htmlFor="email-field">
          Email
        </Label>
        <Separator testId="content-separator" />
        <Switch accessibilityLabel="Notifications" checked testId="settings-switch" />
        <Toggle aria-label="Bold" pressed testId="toggle-bold">
          Bold
        </Toggle>
        <ToggleGroup type="single">
          <ToggleGroupItem testId="view-grid" value="grid">
            Grid
          </ToggleGroupItem>
        </ToggleGroup>
        <Icon as={CircleAlertIcon} data-testid="status-icon" />
      </div>,
    );

    expect(screen.getByTestId("user-avatar")).toBeInTheDocument();
    expect(screen.getByTestId("status-badge")).toHaveTextContent("Active");
    expect(screen.getByTestId("email-label")).toHaveTextContent("Email");
    expect(screen.getByTestId("content-separator")).toBeInTheDocument();
    expect(screen.getByTestId("settings-switch")).toHaveAttribute("data-state", "checked");
    expect(screen.getByTestId("toggle-bold")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("view-grid")).toBeInTheDocument();
    expect(screen.getByTestId("status-icon")).toBeInTheDocument();
  });
});
