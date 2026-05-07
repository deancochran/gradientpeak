import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOVEMENT_THRESHOLDS } from "./config";
import { LiveMetricsManager } from "./LiveMetricsManager";

vi.mock("expo-file-system", () => {
  class MockDirectory {
    uri: string;
    exists = false;

    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }

    create() {
      this.exists = true;
    }

    list() {
      return [];
    }

    delete() {
      this.exists = false;
    }
  }

  class MockFile {
    uri: string;

    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }

    write() {}

    textSync() {
      return "{}";
    }
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: { cache: "cache" },
  };
});

vi.mock("expo", () => {
  class MockEventEmitter {
    private listeners = new Map<string, Array<(...args: unknown[]) => void>>();

    emit(eventName: string, ...args: unknown[]) {
      for (const listener of this.listeners.get(eventName) ?? []) {
        listener(...args);
      }
    }

    on(eventName: string, listener: (...args: unknown[]) => void) {
      const listeners = this.listeners.get(eventName) ?? [];
      listeners.push(listener);
      this.listeners.set(eventName, listeners);
      return { remove: () => this.removeListener(eventName, listener) };
    }

    removeListener(eventName: string, listener: (...args: unknown[]) => void) {
      this.listeners.set(
        eventName,
        (this.listeners.get(eventName) ?? []).filter((current) => current !== listener),
      );
    }

    removeAllListeners(eventName?: string) {
      if (eventName) {
        this.listeners.delete(eventName);
        return;
      }
      this.listeners.clear();
    }
  }

  return { EventEmitter: MockEventEmitter };
});

describe("LiveMetricsManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resets cumulative session state when a new recording starts", async () => {
    const manager = new LiveMetricsManager({} as never);

    await manager.startRecording();
    manager.ingestLocationData({ latitude: 40, longitude: -75, accuracy: 5, timestamp: 1_000 });
    manager.ingestLocationData({ latitude: 40.001, longitude: -75, accuracy: 5, timestamp: 2_000 });
    manager.ingestSensorData({ metric: "power", dataType: "float", value: 300, timestamp: 2_000 });

    expect(manager.getSessionStats().distance).toBeGreaterThan(0);
    expect(manager.getSessionStats().maxPower).toBe(300);

    await manager.finishRecording();
    await manager.startRecording();

    expect(manager.getSessionStats().distance).toBe(0);
    expect(manager.getSessionStats().maxPower).toBe(0);

    await manager.cleanup();
  });

  it("ignores poor accuracy GPS fixes for live distance and route buffers", async () => {
    const manager = new LiveMetricsManager({} as never);

    await manager.startRecording();
    manager.ingestLocationData({ latitude: 40, longitude: -75, accuracy: 5, timestamp: 1_000 });
    manager.ingestLocationData({
      latitude: 40.001,
      longitude: -75,
      accuracy: MOVEMENT_THRESHOLDS.GPS_ACCURACY_THRESHOLD_M + 1,
      timestamp: 2_000,
    });

    expect(manager.getSessionStats().distance).toBe(0);
    expect(manager.getCurrentReadings().speed).toBeUndefined();
    expect(manager.getCurrentReadings().position).toMatchObject({ lat: 40, lng: -75 });
    expect(manager.getCurrentReadings().lastUpdated.position).toBe(1_000);

    await manager.cleanup();
  });
});
