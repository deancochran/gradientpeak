import { describe, expect, it } from "vitest";
import { RECORDING_CONFIG } from "./config";
import { DataBuffer } from "./DataBuffer";

describe("DataBuffer", () => {
  it("trims readings outside the rolling time window on ingest", () => {
    const buffer = new DataBuffer(2);

    buffer.add({ metric: "power", value: 100, timestamp: 1_000 });
    buffer.add({ metric: "power", value: 110, timestamp: 2_000 });
    buffer.add({ metric: "power", value: 120, timestamp: 4_001 });

    expect(buffer.getReadingsByMetric("power").map((reading) => reading.timestamp)).toEqual([
      4_001,
    ]);
  });

  it("caps high-rate streams per metric", () => {
    const buffer = new DataBuffer(60 * 60);
    const totalReadings = RECORDING_CONFIG.MAX_READINGS_PER_METRIC + 25;

    for (let index = 0; index < totalReadings; index += 1) {
      buffer.add({ metric: "heartrate", value: 140, timestamp: index });
    }

    const readings = buffer.getReadingsByMetric("heartrate");
    expect(readings).toHaveLength(RECORDING_CONFIG.MAX_READINGS_PER_METRIC);
    expect(readings[0]?.timestamp).toBe(25);
    expect(readings.at(-1)?.timestamp).toBe(totalReadings - 1);
  });

  it("keeps readings ordered by timestamp when delayed samples arrive", () => {
    const buffer = new DataBuffer(60);

    buffer.add({ metric: "power", value: 100, timestamp: 1_000 });
    buffer.add({ metric: "power", value: 120, timestamp: 3_000 });
    buffer.add({ metric: "power", value: 110, timestamp: 2_000 });

    expect(buffer.getReadingsByMetric("power").map((reading) => reading.timestamp)).toEqual([
      1_000, 2_000, 3_000,
    ]);
    expect(buffer.getLatest("power")).toBe(120);
  });
});
