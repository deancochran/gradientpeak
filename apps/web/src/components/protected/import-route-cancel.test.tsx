// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RouteEditForm } from "../routes/route-edit-form";
import { ActivityImportForm } from "./activity-import-form";
import { RouteUploadForm } from "./route-upload-form";

// Mock the router boundary, retaining the owner's actual dirty/Cancel hook.
vi.mock("@tanstack/react-router", () => ({ useBlocker: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each([
  "activity import",
  "route upload",
  "route edit",
] as const)("guards the %s owner's Cancel and preserves rejected discard", (owner) => {
  const onCancel = vi.fn();
  const onSubmit = vi.fn();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  if (owner === "activity import")
    render(<ActivityImportForm phase="idle" onCancel={onCancel} onSubmit={onSubmit} />);
  else if (owner === "route upload")
    render(
      <RouteUploadForm
        idempotencyScope="profile-fixture"
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
    );
  else
    render(
      <RouteEditForm
        defaultValues={{ name: "Route", description: null }}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
    );
  const notes = screen.getByLabelText(
    owner === "activity import" ? "Notes" : "Description",
  ) as HTMLTextAreaElement;
  fireEvent.change(notes, { target: { value: "Keep my notes" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(onCancel).not.toHaveBeenCalled();
  expect(notes.value).toBe("Keep my notes");
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onSubmit).not.toHaveBeenCalled();
});
