import { describe, expect, it } from "vitest";

import { createWebRecordingAdapterRegistry } from "./adapters";

describe("web recording adapter capability truth", () => {
  it("keeps the browser-equal manual workflow available without Web Bluetooth", () => {
    const adapters = createWebRecordingAdapterRegistry({
      bluetoothAvailable: false,
      secureContext: true,
    });

    expect(adapters.find((adapter) => adapter.id === "manual-timer")).toMatchObject({
      status: "available",
      liveRecording: true,
      durableLocalQueue: true,
      bleScanning: false,
      ftmsMeasurement: false,
      ftmsControl: false,
    });
    expect(adapters.find((adapter) => adapter.id === "browser-ble")).toMatchObject({
      status: "unavailable",
      ftmsControl: false,
    });
  });

  it("does not turn Chrome-only transport detection into sensor-complete parity", () => {
    const browserBle = createWebRecordingAdapterRegistry({
      bluetoothAvailable: true,
      secureContext: true,
    }).find((adapter) => adapter.id === "browser-ble");

    expect(browserBle).toMatchObject({
      status: "experimental",
      liveRecording: false,
      durableLocalQueue: false,
      bleScanning: true,
      ftmsMeasurement: false,
      ftmsControl: false,
    });
  });

  it("advertises FTMS only through the future desktop bridge adapter", () => {
    const desktop = createWebRecordingAdapterRegistry().find(
      (adapter) => adapter.id === "desktop-bridge",
    );

    expect(desktop).toMatchObject({
      status: "requires-setup",
      bleScanning: true,
      ftmsMeasurement: true,
      ftmsControl: true,
    });
  });
});
