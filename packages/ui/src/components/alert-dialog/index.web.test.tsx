import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { alertDialogFixtures } from "./fixtures";
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
        <AlertDialogContent testId={alertDialogFixtures.confirmDelete.testId}>
          <AlertDialogHeader>
            <AlertDialogTitle>{alertDialogFixtures.confirmDelete.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {alertDialogFixtures.confirmDelete.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>{alertDialogFixtures.confirmDelete.actionLabel}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );

    expect(screen.getByTestId(alertDialogFixtures.confirmDelete.testId)).toBeInTheDocument();
    expect(screen.getByText(alertDialogFixtures.confirmDelete.title)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: alertDialogFixtures.confirmDelete.actionLabel }),
    ).toBeInTheDocument();
  });
});
