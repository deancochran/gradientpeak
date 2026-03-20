import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => import("../../test/react-native"));

import { renderNative } from "../../test/render-native";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./index.native";

describe("AlertDialog native", () => {
  it("maps normalized test props onto the rendered content", () => {
    const { getByTestId, getByText } = renderNative(
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

    expect(getByTestId("confirm-delete-dialog")).toBeTruthy();
    expect(getByText("Delete workout")).toBeTruthy();
    expect(getByText("Delete")).toBeTruthy();
  });
});
