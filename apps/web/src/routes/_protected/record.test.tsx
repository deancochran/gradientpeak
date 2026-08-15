// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecordLayout } from "./record";

const mocks = vi.hoisted(() => ({
  ensureCurrentBrowserContractEpoch: vi.fn<() => Promise<boolean>>(),
  recordingProvider: vi.fn(({ children }: { children: React.ReactNode }) => children),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useRouteContext: () => ({ authUserId: "user-1" }),
  }),
  Outlet: () => <div>Recorder route content</div>,
}));

vi.mock("../../lib/contract-epoch", () => ({
  ensureCurrentBrowserContractEpoch: mocks.ensureCurrentBrowserContractEpoch,
}));

vi.mock("../../lib/recording/provider", () => ({
  TimerOnlyRecordingProvider: mocks.recordingProvider,
}));

beforeEach(() => {
  mocks.ensureCurrentBrowserContractEpoch.mockReset();
  mocks.recordingProvider.mockClear();
});

afterEach(cleanup);

describe("RecordLayout", () => {
  it("does not mount recording storage until recorder cleanup completes", async () => {
    let finishPreparation: (value: boolean) => void = () => undefined;
    mocks.ensureCurrentBrowserContractEpoch.mockReturnValue(
      new Promise<boolean>((resolve) => {
        finishPreparation = resolve;
      }),
    );

    render(<RecordLayout />);

    expect(screen.getByText("Preparing recorder")).toBeTruthy();
    expect(screen.queryByText("Recorder route content")).toBeNull();
    expect(mocks.recordingProvider).not.toHaveBeenCalled();

    await act(async () => finishPreparation(false));

    expect(await screen.findByText("Recorder route content")).toBeTruthy();
    expect(mocks.recordingProvider).toHaveBeenCalledTimes(1);
  });
});
