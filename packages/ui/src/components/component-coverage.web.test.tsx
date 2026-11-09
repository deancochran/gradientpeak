import { CircleAlertIcon } from "lucide-react";
import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../test/render-web";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar/index.web";
import { Badge } from "./badge/index.web";
import { Icon } from "./icon/index.web";
import { Label } from "./label/index.web";
import { Separator } from "./separator/index.web";
import { Switch } from "./switch/index.web";
import { Toggle } from "./toggle/index.web";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group/index.web";

describe("web component coverage", () => {
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
  });
});
