// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecordingStorageBoundary } from "./recording-storage-boundary";

const mocks = vi.hoisted(() => ({
  ensureCurrentBrowserContractEpoch: vi.fn<() => Promise<boolean>>(),
}));

vi.mock("../../lib/contract-epoch", () => ({
  ensureCurrentBrowserContractEpoch: mocks.ensureCurrentBrowserContractEpoch,
}));

beforeEach(() => {
  mocks.ensureCurrentBrowserContractEpoch.mockReset();
});

afterEach(cleanup);

describe("RecordingStorageBoundary", () => {
  it("limits preparation to recorder content", () => {
    mocks.ensureCurrentBrowserContractEpoch.mockReturnValue(new Promise(() => undefined));

    render(
      <RecordingStorageBoundary>
        <div>Recorder content</div>
      </RecordingStorageBoundary>,
    );

    expect(screen.getByText("Preparing recorder")).toBeTruthy();
    expect(screen.queryByText("Recorder content")).toBeNull();
  });

  it("shows recorder content after storage is ready", async () => {
    mocks.ensureCurrentBrowserContractEpoch.mockResolvedValue(false);

    render(
      <RecordingStorageBoundary>
        <div>Recorder content</div>
      </RecordingStorageBoundary>,
    );

    expect(await screen.findByText("Recorder content")).toBeTruthy();
  });

  it("offers a fresh retry when preparation is blocked", async () => {
    mocks.ensureCurrentBrowserContractEpoch
      .mockRejectedValueOnce(new Error("blocked"))
      .mockResolvedValueOnce(true);

    render(
      <RecordingStorageBoundary>
        <div>Recorder content</div>
      </RecordingStorageBoundary>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.getByText("Recorder content")).toBeTruthy());
    expect(mocks.ensureCurrentBrowserContractEpoch).toHaveBeenCalledTimes(2);
  });
});
