// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CssTestForm } from "./css-test-form";

afterEach(cleanup);

describe("CssTestForm", () => {
  it("previews and submits one validated 400m/200m CSS test", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CssTestForm onCancel={() => undefined} onSubmit={onSubmit} />);

    expect(screen.getByText("1:36 /100m")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("400m time"), { target: { value: "6:10" } });
    expect(screen.getByText("1:41 /100m")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Record CSS test" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith({
      operationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      recordedAt: expect.any(Date),
      time400Seconds: 370,
      time200Seconds: 168,
    });
  });

  it("shows protocol validation and does not submit invalid paired times", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CssTestForm onCancel={() => undefined} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("400m time"), { target: { value: "5:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Record CSS test" }));

    expect(
      await screen.findByText("400m time must be greater than twice the 200m time"),
    ).toBeTruthy();
    expect(screen.getByText("Enter valid test times")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps an atomic mutation failure visible", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Connection lost"));
    render(<CssTestForm onCancel={() => undefined} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "Record CSS test" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "CSS test was not recorded: Connection lost",
    );
  });

  it("retains the operation ID and timestamp across an ambiguous retry, then rotates after success", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new Error("Connection lost"))
      .mockResolvedValue(undefined);
    render(<CssTestForm onCancel={() => undefined} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "Record CSS test" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Record CSS test" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));

    expect(onSubmit.mock.calls[1]?.[0].operationId).toBe(onSubmit.mock.calls[0]?.[0].operationId);
    expect(onSubmit.mock.calls[1]?.[0].recordedAt).toEqual(onSubmit.mock.calls[0]?.[0].recordedAt);

    fireEvent.click(screen.getByRole("button", { name: "Record CSS test" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(3));
    expect(onSubmit.mock.calls[2]?.[0].operationId).not.toBe(
      onSubmit.mock.calls[1]?.[0].operationId,
    );
  });
});
