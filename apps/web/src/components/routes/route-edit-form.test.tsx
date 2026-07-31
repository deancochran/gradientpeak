// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteEditForm } from "./route-edit-form";

afterEach(cleanup);

function renderForm(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(
    <RouteEditForm
      defaultValues={{ description: "Original notes", name: "Ridge loop" }}
      onCancel={() => undefined}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit };
}

describe("RouteEditForm", () => {
  it("submits normalized route metadata through stable selectors", async () => {
    const { onSubmit } = renderForm();

    expect(screen.getByTestId("route-edit-form")).toBeTruthy();
    fireEvent.change(screen.getByTestId("route-edit-name-input"), {
      target: { value: "  Updated ridge loop  " },
    });
    fireEvent.change(screen.getByTestId("route-edit-description-input"), {
      target: { value: "   " },
    });
    fireEvent.submit(screen.getByTestId("route-edit-form"));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        description: null,
        name: "Updated ridge loop",
      }),
    );
  });

  it("keeps invalid metadata in the form and blocks submission", async () => {
    const { onSubmit } = renderForm();

    fireEvent.change(screen.getByTestId("route-edit-name-input"), {
      target: { value: "" },
    });
    fireEvent.submit(screen.getByTestId("route-edit-form"));

    expect(await screen.findByText("Route name is required")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows a retryable root error without discarding edits", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Route update failed"));
    renderForm(onSubmit);

    fireEvent.change(screen.getByTestId("route-edit-name-input"), {
      target: { value: "Keep this edit" },
    });
    fireEvent.submit(screen.getByTestId("route-edit-form"));

    expect((await screen.findByRole("alert")).textContent).toContain("Route update failed");
    expect((screen.getByTestId("route-edit-name-input") as HTMLInputElement).value).toBe(
      "Keep this edit",
    );
  });
});
