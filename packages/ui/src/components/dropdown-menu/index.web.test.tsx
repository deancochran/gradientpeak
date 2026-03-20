import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "./index.web";

describe("DropdownMenu web", () => {
  it("renders trigger text and menu items when open", () => {
    renderWeb(
      <DropdownMenu modal={false} open>
        <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Pin workout</DropdownMenuItem>
          <DropdownMenuShortcut>Shift+P</DropdownMenuShortcut>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Pin workout" })).toBeVisible();
    expect(screen.getByText("Shift+P")).toBeInTheDocument();
  });
});
