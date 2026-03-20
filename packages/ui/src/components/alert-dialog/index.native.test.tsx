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
    const { getByTestId } = renderNative(
      <AlertDialog open>
        <AlertDialogContent testId="confirm-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle testID="confirm-delete-title">
              Delete workout
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction testID="confirm-delete-action">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );

    expect(getByTestId("confirm-delete-dialog")).toBeTruthy();
    expect(getByTestId("confirm-delete-title")).toBeTruthy();
    expect(getByTestId("confirm-delete-action")).toBeTruthy();
  });
});
