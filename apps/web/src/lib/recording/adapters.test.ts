import { describe, expect, it } from "vitest";
import { createWebRecordingAdapterRegistry } from "./adapters";

describe("web recording adapter capability truth", () => {
  it("exposes only the indoor timer", () => {
    expect(createWebRecordingAdapterRegistry()).toEqual([
      expect.objectContaining({ id: "manual-timer", liveRecording: true, durableLocalQueue: true }),
    ]);
  });
});
