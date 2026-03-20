import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "./index.web";

describe("Sheet web", () => {
  it("renders trigger text and open sheet content", () => {
    renderWeb(
      <Sheet open>
        <SheetTrigger>Open filters</SheetTrigger>
        <SheetContent aria-describedby={undefined} side="right">
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Refine the schedule view.</SheetDescription>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByRole("dialog", { name: "Filters" })).toBeVisible();
    expect(screen.getByText("Refine the schedule view.")).toBeInTheDocument();
  });
});
