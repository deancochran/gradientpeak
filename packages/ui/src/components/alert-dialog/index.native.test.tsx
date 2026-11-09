import { Text } from "react-native";
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
  it("maps normalized test props onto the rendered content", async () => {
    const { getByTestId } = await renderNative(
      <AlertDialog open>
        <AlertDialogContent testId="confirm-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle testID="confirm-delete-title">
              <Text>Delete activity</Text>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Text>This cannot be undone.</Text>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction testID="confirm-delete-action">
              <Text>Delete</Text>
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
