import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "./index.web";

describe("Dialog web", () => {
  it("renders trigger text and open dialog content", () => {
    renderWeb(
      <Dialog open>
        <DialogTrigger>Open plan details</DialogTrigger>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Plan details</DialogTitle>
          <DialogDescription>Review the upcoming block before saving.</DialogDescription>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole("dialog", { name: "Plan details" })).toBeVisible();
    expect(screen.getByText("Review the upcoming block before saving.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(2);
  });
});
