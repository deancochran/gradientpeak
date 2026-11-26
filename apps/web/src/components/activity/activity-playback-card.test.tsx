// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityPlaybackCard } from "./activity-playback-card";

const start = Date.parse("2026-09-20T10:00:00Z");
const records = [
  {
    timestamp: new Date(start),
    power: 100,
    heartRate: 140,
    speed: 5,
    distance: 0,
    positionLat: 40,
    positionLong: -74,
  },
  {
    timestamp: new Date(start + 1000),
    power: 200,
    heartRate: 150,
    speed: 6,
    distance: 6,
    positionLat: 40.0001,
    positionLong: -74.0001,
  },
  {
    timestamp: new Date(start + 20000),
    power: 300,
    heartRate: 160,
    speed: 7,
    distance: 30,
    positionLat: 40.001,
    positionLong: -74.001,
  },
];
let wall = 0;
let nextRequest = 0;
const frames = new Map<number, FrameRequestCallback>();
beforeEach(() => {
  wall = 0;
  frames.clear();
  nextRequest = 0;
  vi.spyOn(performance, "now").mockImplementation(() => wall);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextRequest;
      frames.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => frames.delete(id)),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function tick(milliseconds: number) {
  wall += milliseconds;
  const callbacks = [...frames.values()];
  frames.clear();
  act(() => {
    for (const callback of callbacks) callback(wall);
  });
}
function mount() {
  return render(
    <ActivityPlaybackCard
      records={records}
      sourceKey="activity-1:segment-1"
      availability="ready"
    />,
  );
}

describe("persisted activity playback", () => {
  it("plays, changes speed, pauses, seeks through gaps, reaches end and restarts using recorded samples", () => {
    mount();
    expect(screen.getByTestId("playback-metric-power").textContent).toContain("100 W");
    fireEvent.click(screen.getByRole("button", { name: "Play playback" }));
    tick(500);
    expect(screen.getByTestId("playback-clock").textContent).toContain("0:00.5");
    expect(screen.getByRole("status").textContent).toBe("Playing.");
    fireEvent.click(screen.getByRole("button", { name: "Playback speed 2x" }));
    tick(250);
    expect(screen.getByTestId("playback-metric-power").textContent).toContain("200 W");
    expect(screen.getByTestId("playback-position-marker").getAttribute("data-latitude")).toBe(
      "40.0001",
    );
    fireEvent.click(screen.getByRole("button", { name: "Pause playback" }));
    tick(2000);
    expect(screen.getByTestId("playback-clock").textContent).toContain("0:01.0");
    const slider = screen.getByRole("slider", { name: "Playback elapsed time" });
    fireEvent.change(slider, { target: { value: "10000" } });
    expect(screen.getByTestId("playback-metric-power").textContent).toContain("Unavailable");
    expect(screen.queryByTestId("playback-position-marker")).toBeNull();
    expect(screen.getByText("No recorded position at this time.")).toBeTruthy();
    fireEvent.keyDown(slider, { key: "End" });
    expect(screen.getByRole("status").textContent).toBe("End of playback.");
    expect(screen.getByTestId("playback-metric-power").textContent).toContain("300 W");
    fireEvent.click(screen.getByRole("button", { name: "Restart playback" }));
    expect(screen.getByTestId("playback-clock").textContent).toContain("0:00.0");
    fireEvent.click(screen.getByRole("button", { name: "Power" }));
    expect(screen.queryByTestId("playback-metric-power")).toBeNull();
  });

  it("provides keyboard seeking, pauses on slider focus, and clamps irregular stream ends", () => {
    render(
      <ActivityPlaybackCard
        sourceKey="short"
        availability="ready"
        records={[
          { timestamp: new Date(start), heartRate: 140 },
          { timestamp: new Date(start + 1251), heartRate: 151 },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Play playback" }));
    const slider = screen.getByRole("slider", { name: "Playback elapsed time" });
    fireEvent.focus(slider);
    expect(screen.getByRole("button", { name: "Play playback" })).toBeTruthy();
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider).toHaveProperty("value", "1000");
    fireEvent.keyDown(slider, { key: "End" });
    expect(slider).toHaveProperty("value", "1251");
    fireEvent.keyDown(slider, { key: "Home" });
    expect(slider).toHaveProperty("value", "0");
    fireEvent.click(screen.getByRole("button", { name: "Play playback" }));
    tick(2000);
    expect(screen.getByRole("status").textContent).toBe("End of playback.");
    expect(frames.size).toBe(0);
  });

  it("pauses on visibility loss without advancing through the background and cleans up", () => {
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "Play playback" }));
    tick(500);
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    wall += 60000;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(screen.getByTestId("playback-clock").textContent).toContain("0:00.5");
    expect(frames.size).toBe(0);
    visibility.mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(screen.getByRole("button", { name: "Play playback" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Play playback" }));
    view.unmount();
    expect(frames.size).toBe(0);
  });

  it("resets data, rate, selected metrics, and clock across scope and record-array changes", () => {
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "Playback speed 4x" }));
    fireEvent.click(screen.getByRole("button", { name: "Play playback" }));
    tick(500);
    view.rerender(
      <ActivityPlaybackCard
        records={records}
        sourceKey="activity-2:segment-2"
        availability="ready"
      />,
    );
    expect(screen.getByTestId("playback-clock").textContent).toContain("0:00.0");
    expect(
      screen.getByRole("button", { name: "Playback speed 1x" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(frames.size).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Play playback" }));
    tick(500);
    view.rerender(
      <ActivityPlaybackCard
        records={[
          { timestamp: new Date(start), cadence: 90 },
          { timestamp: new Date(start + 1000), cadence: 95 },
        ]}
        sourceKey="activity-2:segment-2"
        availability="ready"
      />,
    );
    expect(screen.queryByTestId("playback-metric-power")).toBeNull();
    expect(screen.getByTestId("playback-metric-cadence").textContent).toContain("90 /min");
    expect(screen.getByText("This segment has no recorded GPS positions.")).toBeTruthy();
    expect(screen.getByTestId("playback-clock").textContent).toContain("0:00.0");
  });

  it("shows truthful loading, errors, retry, private and empty states without cached playback controls", () => {
    const retry = vi.fn();
    const view = render(
      <ActivityPlaybackCard records={records} sourceKey="a" availability="loading" />,
    );
    expect(screen.getByText("Loading recorded playback…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Play playback" })).toBeNull();
    view.rerender(
      <ActivityPlaybackCard
        records={records}
        sourceKey="a"
        availability="error"
        errorMessage="File unavailable"
        onRetry={retry}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("File unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry playback" }));
    expect(retry).toHaveBeenCalledOnce();
    view.rerender(<ActivityPlaybackCard records={records} sourceKey="a" availability="private" />);
    expect(screen.queryByTestId("playback-position-marker")).toBeNull();
    view.rerender(
      <ActivityPlaybackCard
        records={[{ timestamp: new Date(start) }]}
        sourceKey="a"
        availability="ready"
      />,
    );
    expect(
      screen.getByText(
        "No timestamped measurements or recorded GPS positions are available in this segment.",
      ),
    ).toBeTruthy();
  });
});
