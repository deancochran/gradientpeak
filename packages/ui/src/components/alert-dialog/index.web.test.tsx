import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./index.web";

describe("AlertDialog web", () => {
  it("maps normalized test props onto the rendered content", () => {
    renderWeb(
      <AlertDialog open>
        <AlertDialogContent testId="confirm-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workout</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );

    expect(screen.getByTestId("confirm-delete-dialog")).toBeInTheDocument();
    expect(screen.getByText("Delete workout")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});
