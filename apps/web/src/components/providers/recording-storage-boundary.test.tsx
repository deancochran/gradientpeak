// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
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
  it("keeps its child mounted while storage becomes ready", async () => {
    let resolvePreparation: (() => void) | undefined;
    mocks.ensureCurrentBrowserContractEpoch.mockReturnValue(
      new Promise((resolve) => {
        resolvePreparation = () => resolve(true);
      }),
    );

    function StatefulChild() {
      const [count, setCount] = useState(0);
      return (
        <button onClick={() => setCount((current) => current + 1)} type="button">
          Count: {count}
        </button>
      );
    }

    render(
      <RecordingStorageBoundary>
        <StatefulChild />
      </RecordingStorageBoundary>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Count: 0" }));
    expect(screen.getByRole("button", { name: "Count: 1" })).toBeTruthy();

    resolvePreparation?.();

    await waitFor(() => expect(screen.getByRole("button", { name: "Count: 1" })).toBeTruthy());
  });

  it("continues rendering its child when preparation is blocked", async () => {
    mocks.ensureCurrentBrowserContractEpoch.mockRejectedValue(new Error("blocked"));

    render(
      <RecordingStorageBoundary>
        <div>Protected page content</div>
      </RecordingStorageBoundary>,
    );

    await waitFor(() => expect(screen.getByText("Protected page content")).toBeTruthy());
  });
});
