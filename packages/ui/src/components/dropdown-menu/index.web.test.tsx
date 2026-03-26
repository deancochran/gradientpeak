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
  it("renders trigger text and menu items when open", async () => {
    renderWeb(
      <DropdownMenu modal={false} open>
        <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Pin workout</DropdownMenuItem>
          <DropdownMenuShortcut>Shift+P</DropdownMenuShortcut>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(await screen.findByRole("menuitem", { name: "Pin workout" })).toBeVisible();
    expect(screen.getByText("Shift+P")).toBeInTheDocument();
  });
});
