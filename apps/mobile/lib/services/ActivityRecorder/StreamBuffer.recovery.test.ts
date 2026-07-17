import { beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, string>();
const directories = new Set<string>();
let failWritePath: string | null = null;

vi.mock("expo-file-system", () => {
  class Directory {
    uri: string;
    constructor(...parts: string[]) {
      this.uri =
        parts.length === 1
          ? parts[0]!
          : `${parts[0]!.replace(/\/$/, "")}/${parts.slice(1).join("/")}`;
    }
    get exists() {
      return directories.has(this.uri);
    }
    create() {
      directories.add(this.uri);
    }
    delete() {
      directories.delete(this.uri);
      for (const path of files.keys()) if (path.startsWith(`${this.uri}/`)) files.delete(path);
    }
    list() {
      return [...files.keys()]
        .filter((path) => path.startsWith(`${this.uri}/`))
        .map((path) => new File(path));
    }
  }
  class File {
    uri: string;
    constructor(...parts: string[]) {
      this.uri =
        parts.length === 1
          ? parts[0]!
          : `${parts[0]!.replace(/\/$/, "")}/${parts.slice(1).join("/")}`;
    }
    get exists() {
      return files.has(this.uri);
    }
    write(value: string) {
      if (failWritePath && this.uri.includes(failWritePath)) throw new Error("interrupted write");
      files.set(this.uri, value);
    }
    textSync() {
      const value = files.get(this.uri);
      if (value === undefined) throw new Error("missing file");
      return value;
    }
    delete() {
      files.delete(this.uri);
    }
  }
  return { Directory, File, Paths: { cache: "file:///cache" } };
});

import { StreamBuffer } from "./StreamBuffer";

function chunk(metric: string, values: number[] | number[][], timestamps: number[]) {
  return JSON.stringify({
    metric,
    dataType: metric === "latlng" ? "latlng" : "float",
    values,
    timestamps,
    sampleCount: values.length,
    startTime: "2026-01-01T10:00:00.000Z",
    endTime: "2026-01-01T10:01:00.000Z",
  });
}

function commit(chunkIndex: number, committedFiles: string[]) {
  return JSON.stringify({
    version: 1,
    chunkIndex,
    files: committedFiles,
    committedAt: "2026-01-01T10:01:00.000Z",
  });
}

describe("StreamBuffer durable recovery", () => {
  beforeEach(() => {
    files.clear();
    directories.clear();
    failWritePath = null;
    directories.add("file:///streams");
  });

  it("strictly reopens chunks and replays metrics, positions, altitude, and FIT records", async () => {
    files.set("file:///streams/chunk_0_heart_rate.json", chunk("heart_rate", [140], [1000]));
    files.set("file:///streams/chunk_0_distance.json", chunk("distance", [25], [1000]));
    files.set("file:///streams/chunk_1_latlng.json", chunk("latlng", [[10, 20]], [2000]));
    files.set("file:///streams/chunk_1_altitude.json", chunk("altitude", [50], [2000]));
    files.set(
      "file:///streams/commit_0.json",
      commit(0, ["chunk_0_heart_rate.json", "chunk_0_distance.json"]),
    );
    files.set(
      "file:///streams/commit_1.json",
      commit(1, ["chunk_1_latlng.json", "chunk_1_altitude.json"]),
    );

    const { replay, streamBuffer } = await StreamBuffer.reopenForRecovery(["file:///streams"]);
    expect(replay.sensorReadings).toEqual([
      expect.objectContaining({ metric: "heart_rate", value: 140, timestamp: 1000 }),
      expect.objectContaining({ metric: "distance", value: 25, timestamp: 1000 }),
    ]);
    expect(replay.locations).toEqual([
      { latitude: 10, longitude: 20, altitude: 50, timestamp: 2000 },
    ]);
    expect(replay.fitRecords).toEqual([
      expect.objectContaining({ timestamp: 1000, heartRate: 140, distance: 25 }),
      expect.objectContaining({ timestamp: 2000, latitude: 10, longitude: 20, altitude: 50 }),
    ]);
    expect(streamBuffer.getBufferStatus().chunkIndex).toBe(2);
  });

  it("fails closed on corrupt chunks and deletes streams only on explicit discard", async () => {
    files.set("file:///streams/chunk_0_power.json", chunk("power", [200], []));
    files.set("file:///streams/commit_0.json", commit(0, ["chunk_0_power.json"]));
    await expect(StreamBuffer.reopenForRecovery("file:///streams")).rejects.toThrow("Corrupt");
    expect(directories.has("file:///streams")).toBe(true);
    StreamBuffer.deleteDurableDirectories(["file:///streams", "file:///streams"]);
    expect(directories.has("file:///streams")).toBe(false);
  });

  it("recovers the last committed prefix and removes an interrupted trailing multi-file flush", async () => {
    const buffer = new StreamBuffer("file:///streams");
    buffer.add({ metric: "heart_rate", dataType: "float", value: 140, timestamp: 1000 });
    await buffer.flushToFiles();
    buffer.add({ metric: "power", dataType: "float", value: 220, timestamp: 1000 });
    buffer.add({ metric: "cadence", dataType: "float", value: 90, timestamp: 1000 });
    failWritePath = "chunk_1_cadence.json";

    await expect(buffer.flushToFiles()).rejects.toThrow("interrupted write");
    const committedRecovery = await StreamBuffer.reopenForRecovery("file:///streams");
    expect(committedRecovery.replay.sensorReadings).toEqual([
      expect.objectContaining({ metric: "heart_rate", value: 140 }),
    ]);
    expect(files.has("file:///streams/chunk_1_power.json")).toBe(false);

    failWritePath = null;
    await buffer.flushToFiles();
    const { replay } = await StreamBuffer.reopenForRecovery("file:///streams");
    expect(replay.sensorReadings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: "heart_rate", value: 140 }),
        expect.objectContaining({ metric: "power", value: 220 }),
        expect.objectContaining({ metric: "cadence", value: 90 }),
      ]),
    );
  });
});
