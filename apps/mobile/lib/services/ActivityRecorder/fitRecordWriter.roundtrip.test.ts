import { parseFitFileWithSDK } from "@repo/core/activity-files/fit-parser";
import { Buffer } from "buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, Uint8Array>();
vi.mock("expo-file-system", () => ({
  Paths: { cache: { uri: "file:///cache/" }, document: { uri: "file:///documents/" } },
  Directory: class MockDirectory {
    exists = false;
    constructor(public uri: string) {}
    create() {
      this.exists = true;
    }
    delete() {
      this.exists = false;
    }
    list() {
      return [];
    }
  },
  File: class MockFile {
    exists = false;
    size = 0;
    constructor(public uri: string) {
      const bytes = files.get(uri);
      this.exists = bytes !== undefined;
      this.size = bytes?.length ?? 0;
    }
    create() {
      this.exists = true;
    }
    async write(bytes: Uint8Array) {
      const value = Uint8Array.from(bytes);
      files.set(this.uri, value);
      this.exists = true;
      this.size = value.length;
    }
    async base64() {
      return Buffer.from(files.get(this.uri) ?? []).toString("base64");
    }
  },
}));

import { type FitRecord, GarminFitEncoder } from "../fit/GarminFitEncoder";
import {
  appendActivityRecorderFitRecord,
  isSupersededRecordingEvidence,
  rebaseRetainedFitRecordDistances,
} from "./fitRecordWriter";

describe("ActivityRecorder FIT rest round trip", () => {
  beforeEach(() => files.clear());

  it("round-trips a rewound activity/rest attempt without superseded or rest records", async () => {
    const origin = Date.parse("2026-01-01T10:00:00.000Z");
    const encoder = new GarminFitEncoder("activity-recorder-rest", "profile-1");
    await encoder.initialize([], new Date(origin + 30_000));
    const rawRecorderRecords: FitRecord[] = [];
    const recorderSink = {
      addRecord: async (record: FitRecord) => {
        rawRecorderRecords.push(record);
      },
    };
    const activity = { role: "activity" } as never;
    const rest = { role: "rest" } as never;
    const append = (offset: number, currentOccurrence: never, distance: number) =>
      appendActivityRecorderFitRecord({
        encoder: recorderSink,
        hasPlan: true,
        currentOccurrence,
        timestamp: origin + offset,
        distance,
        readings: { heartRate: 140, speed: 3 },
      });

    const rewindJournal = [
      {
        supersededFrom: new Date(origin).toISOString(),
        rewoundAt: new Date(origin + 30_000).toISOString(),
        sourceDistanceMeters: 60,
        destinationDistanceMeters: 0,
      },
    ];
    expect(
      [0, 5_000, 10_000, 20_000, 25_000].every((offset) =>
        isSupersededRecordingEvidence(origin + offset, rewindJournal),
      ),
    ).toBe(true);

    await append(35_000, activity, 60);
    await append(40_000, activity, 75);
    await expect(append(45_000, rest, 90)).resolves.toBe(false);
    await append(50_000, activity, 90);
    await append(55_000, activity, 105);
    await expect(append(60_000, rest, 120)).resolves.toBe(false);
    await expect(
      appendActivityRecorderFitRecord({
        encoder: recorderSink,
        hasPlan: true,
        currentOccurrence: undefined,
        timestamp: origin + 65_000,
        distance: 120,
        readings: { heartRate: 140, speed: 0 },
      }),
    ).resolves.toBe(false);
    const retainedRecords = rebaseRetainedFitRecordDistances(rawRecorderRecords, rewindJournal);
    expect(retainedRecords.map((record) => record.distance)).toEqual([0, 15, 30, 45]);
    await encoder.addRecords(retainedRecords);

    await encoder.finalize([
      {
        startTime: origin + 30_000,
        endedAt: origin + 45_000,
        totalTime: 15_000,
        movingTime: 15_000,
        distance: 30,
        avgSpeed: 2,
        maxSpeed: 3,
        sport: "running",
        subSport: "street",
        role: "activity",
      },
      {
        startTime: origin + 50_000,
        endedAt: origin + 60_000,
        totalTime: 10_000,
        movingTime: 10_000,
        distance: 30,
        avgSpeed: 3,
        maxSpeed: 3,
        sport: "running",
        subSport: "street",
        role: "activity",
      },
    ]);

    const decoded = parseFitFileWithSDK(await encoder.getFile());
    expect(decoded.sessions).toHaveLength(2);
    expect(decoded.records).toHaveLength(4);
  });

  it("keeps cumulative distance monotonic and nonnegative across multiple rewinds", () => {
    const origin = Date.parse("2026-01-01T10:00:00.000Z");
    const records = [
      { timestamp: origin + 5_000, distance: 20 },
      { timestamp: origin + 35_000, distance: 60 },
      { timestamp: origin + 40_000, distance: 90 },
      { timestamp: origin + 65_000, distance: 120 },
      { timestamp: origin + 70_000, distance: 150 },
    ];
    const rewinds = [
      {
        supersededFrom: new Date(origin).toISOString(),
        rewoundAt: new Date(origin + 30_000).toISOString(),
        sourceDistanceMeters: 60,
        destinationDistanceMeters: 0,
      },
      {
        supersededFrom: new Date(origin + 40_000).toISOString(),
        rewoundAt: new Date(origin + 60_000).toISOString(),
        sourceDistanceMeters: 120,
        destinationDistanceMeters: 30,
      },
    ];

    expect(
      rebaseRetainedFitRecordDistances(records, rewinds).map((record) => record.distance),
    ).toEqual([0, 30, 60]);
  });
});
