import {
  compareActivityArtifactSemantics,
  decodeFitActivityArtifact,
  parseFitFileWithSDK,
  projectFitArtifactSemantics,
} from "@repo/core";
import { Buffer } from "buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fitTimerSeconds } from "./fit-time";
import { type FitFinalizeOptions, type FitSessionData, GarminFitEncoder } from "./GarminFitEncoder";

const files = new Map<string, Uint8Array>();

vi.mock("expo-file-system", () => ({
  Paths: { cache: { uri: "file:///cache/" }, document: { uri: "file:///documents/" } },
  Directory: class MockDirectory {
    exists = false;
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
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
    uri: string;
    exists = false;
    size = 0;
    constructor(uri: string) {
      this.uri = uri;
      const bytes = files.get(uri);
      this.exists = bytes !== undefined;
      this.size = bytes?.length ?? 0;
    }
    create() {
      this.exists = true;
    }
    async write(bytes: Uint8Array) {
      files.set(this.uri, Uint8Array.from(bytes));
      this.exists = true;
      this.size = bytes.length;
    }
    async base64() {
      return Buffer.from(files.get(this.uri) ?? []).toString("base64");
    }
  },
}));

const ORIGIN = Date.parse("2026-01-01T10:00:00.000Z");

function session(
  input: Partial<FitSessionData> &
    Pick<FitSessionData, "startTime" | "endedAt" | "sport" | "subSport">,
): FitSessionData {
  const elapsed = (input.endedAt ?? input.startTime) - input.startTime;
  return {
    totalTime: elapsed,
    movingTime: elapsed,
    distance: 0,
    avgSpeed: 0,
    maxSpeed: 0,
    ...input,
  };
}

async function encode(
  sessions: FitSessionData[],
  id = "round-trip",
  options: FitFinalizeOptions = {},
): Promise<Uint8Array> {
  const firstSession = sessions[0];
  if (!firstSession) throw new Error("The fixture requires at least one session.");
  const encoder = new GarminFitEncoder(id, "athlete");
  await encoder.initialize([], new Date(firstSession.startTime));
  for (const item of sessions) {
    await encoder.addRecord({ timestamp: item.startTime, distance: 0 });
    await encoder.addRecord({
      timestamp: (item.endedAt ?? item.startTime + item.totalTime) - 1000,
      distance: item.distance,
    });
    if (item.sport === "swimming" && item.subSport === "lap_swimming") {
      await encoder.addSwimLength({
        lengthIndex: 0,
        startTime: new Date(item.startTime),
        endedAt: new Date(item.endedAt ?? item.startTime + item.totalTime),
        movingTime: item.totalTime / 1000,
        strokeType: "freestyle",
        averageSpeed: item.distance / (item.totalTime / 1000),
        strokeCount: 20,
        totalActivityDistance: item.distance,
      });
    }
  }
  await encoder.finalize(sessions, [], options);
  return encoder.getFile();
}

describe("fitTimerSeconds", () => {
  it("converts recorder milliseconds to FIT timer seconds", () => {
    expect(fitTimerSeconds(2_400_000)).toBe(2_400);
  });

  it("does not emit a negative timer duration", () => {
    expect(fitTimerSeconds(-1)).toBe(0);
  });
});

describe("GarminFitEncoder semantic FIT round-trip", () => {
  beforeEach(() => files.clear());

  it("preserves ordinary single-session output", async () => {
    const encoder = new GarminFitEncoder("single", "athlete");
    await encoder.initialize([], new Date(ORIGIN));
    await encoder.addRecord({ timestamp: ORIGIN, distance: 0, heartRate: 140 });
    await encoder.addRecord({ timestamp: ORIGIN + 59_000, distance: 200, heartRate: 150 });
    await encoder.finalize({
      startTime: ORIGIN,
      endedAt: ORIGIN + 60_000,
      totalTime: 60_000,
      distance: 200,
      avgSpeed: 3.333,
      maxSpeed: 4,
      sport: "running",
      subSport: "street",
    });

    const activity = parseFitFileWithSDK(await encoder.getFile());
    expect(activity.metadata.type).toBe("running");
    expect(activity.sessions).toHaveLength(1);
    expect(activity.records).toHaveLength(2);
    expect(activity.summary.totalDistance).toBe(200);
    expect(activity.summary.avgSpeed).toBe(3.333);
    expect(activity.summary.maxSpeed).toBe(4);
  });

  it("encodes ordered triathlon, repeated sport, transitions, laps, and pauses", async () => {
    const sessions = [
      session({
        startTime: ORIGIN,
        endedAt: ORIGIN + 30_000,
        totalTime: 25_000,
        movingTime: 25_000,
        distance: 25,
        sport: "swimming",
        subSport: "lap_swimming",
        poolLength: 25,
        poolLengthUnit: "metric",
        numLengths: 1,
        numActiveLengths: 1,
        timerEvents: [
          { type: "pause" as const, timestamp: ORIGIN + 10_000 },
          { type: "resume" as const, timestamp: ORIGIN + 15_000 },
        ],
      }),
      session({
        startTime: ORIGIN + 30_000,
        endedAt: ORIGIN + 35_000,
        sport: "transition",
        subSport: "swim_to_bike_transition",
        role: "transition",
      }),
      session({
        startTime: ORIGIN + 35_000,
        endedAt: ORIGIN + 65_000,
        distance: 300,
        sport: "cycling",
        subSport: "road",
      }),
      session({
        startTime: ORIGIN + 65_000,
        endedAt: ORIGIN + 70_000,
        sport: "transition",
        subSport: "bike_to_run_transition",
        role: "transition",
      }),
      session({
        startTime: ORIGIN + 70_000,
        endedAt: ORIGIN + 90_000,
        distance: 100,
        sport: "running",
        subSport: "street",
      }),
      session({
        startTime: ORIGIN + 90_000,
        endedAt: ORIGIN + 95_000,
        sport: "transition",
        subSport: "run_to_bike_transition",
        role: "transition",
      }),
      session({
        startTime: ORIGIN + 95_000,
        endedAt: ORIGIN + 115_000,
        distance: 120,
        sport: "running",
        subSport: "trail",
      }),
    ];
    const bytes = await encode(sessions);
    const artifact = decodeFitActivityArtifact(bytes);
    const actual = projectFitArtifactSemantics(artifact);
    expect(parseFitFileWithSDK(bytes).lengths?.[0]).toMatchObject({
      sessionMessageIndex: 0,
      lapMessageIndex: 0,
      swimStroke: "freestyle",
    });
    const expected = {
      segments: [
        {
          role: "activity" as const,
          category: "swim" as const,
          rawSport: 5,
          rawSubSport: 17,
          startOffsetMs: 0,
          endOffsetMs: 30_000,
          activeMs: 25_000,
          movingMs: 25_000,
          distanceMeters: 25,
          pauseRanges: [{ startOffsetMs: 10_000, endOffsetMs: 15_000 }],
          timerEvents: [
            { type: "start" as const, offsetMs: 0 },
            { type: "pause" as const, offsetMs: 10_000 },
            { type: "resume" as const, offsetMs: 15_000 },
            { type: "stop" as const, offsetMs: 30_000 },
          ],
        },
        {
          role: "transition" as const,
          rawSport: 3,
          rawSubSport: 34,
          startOffsetMs: 30_000,
          endOffsetMs: 35_000,
          activeMs: 5_000,
          movingMs: 5_000,
          distanceMeters: 0,
        },
        {
          role: "activity" as const,
          category: "bike" as const,
          rawSport: 2,
          rawSubSport: 7,
          startOffsetMs: 35_000,
          endOffsetMs: 65_000,
          activeMs: 30_000,
          movingMs: 30_000,
          distanceMeters: 300,
        },
        {
          role: "transition" as const,
          rawSport: 3,
          rawSubSport: 32,
          startOffsetMs: 65_000,
          endOffsetMs: 70_000,
          activeMs: 5_000,
          movingMs: 5_000,
          distanceMeters: 0,
        },
        {
          role: "activity" as const,
          category: "run" as const,
          rawSport: 1,
          rawSubSport: 2,
          startOffsetMs: 70_000,
          endOffsetMs: 90_000,
          activeMs: 20_000,
          movingMs: 20_000,
          distanceMeters: 100,
        },
        {
          role: "transition" as const,
          rawSport: 3,
          rawSubSport: 33,
          startOffsetMs: 90_000,
          endOffsetMs: 95_000,
          activeMs: 5_000,
          movingMs: 5_000,
          distanceMeters: 0,
        },
        {
          role: "activity" as const,
          category: "run" as const,
          rawSport: 1,
          rawSubSport: 3,
          startOffsetMs: 95_000,
          endOffsetMs: 115_000,
          activeMs: 20_000,
          movingMs: 20_000,
          distanceMeters: 120,
        },
      ],
      totals: { elapsedMs: 115_000, activeMs: 110_000, movingMs: 110_000, distanceMeters: 545 },
    };
    const expectedWithTimers = {
      ...expected,
      segments: expected.segments.map((segment, index) =>
        index === 0
          ? segment
          : {
              ...segment,
              timerEvents: [
                { type: "start" as const, offsetMs: segment.startOffsetMs },
                { type: "stop" as const, offsetMs: segment.endOffsetMs },
              ],
            },
      ),
    };

    expect(artifact.sessions.map((item) => item.rawSport)).toEqual([5, 3, 2, 3, 1, 3, 1]);
    expect(artifact.activity.rawType).toBe(0);
    expect(artifact.sessions.map((item) => item.extensions?.["fit.trigger"])).toEqual([
      1, 1, 1, 1, 1, 1, 0,
    ]);
    expect(artifact.laps.map((lap) => lap.sessionMessageIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(
      artifact.recordCollections.flatMap((collection) =>
        collection.storage === "inline"
          ? collection.records.map((record) => record.sessionMessageIndex)
          : [],
      ),
    ).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
    expect(
      artifact.events
        .filter((event) => event.timestampMs === ORIGIN + 30_000)
        .map((event) => [event.rawEventType, event.sessionMessageIndex]),
    ).toEqual([
      [1, 0],
      [0, 1],
    ]);
    expect(compareActivityArtifactSemantics({ expected: expectedWithTimers, actual })).toEqual({
      equivalent: true,
      differences: [],
    });
  });

  it("encodes explicit manual and automatic multisport semantics", async () => {
    const sessions = [
      session({
        startTime: ORIGIN,
        endedAt: ORIGIN + 10_000,
        sport: "running",
        subSport: "street",
      }),
      session({
        startTime: ORIGIN + 10_000,
        endedAt: ORIGIN + 20_000,
        sport: "cycling",
        subSport: "road",
      }),
    ];
    const manual = decodeFitActivityArtifact(await encode(sessions, "manual"));
    const automatic = decodeFitActivityArtifact(
      await encode(sessions, "automatic", { multisportMode: "automatic" }),
    );

    expect(manual.activity.rawType).toBe(0);
    expect(manual.sessions.map((item) => item.extensions?.["fit.trigger"])).toEqual([1, 0]);
    expect(automatic.activity.rawType).toBe(1);
    expect(automatic.sessions.map((item) => item.extensions?.["fit.trigger"])).toEqual([2, 0]);
    const firstSession = sessions[0];
    if (!firstSession) throw new Error("The fixture requires a first session.");
    await expect(
      encode([firstSession], "invalid-automatic", { multisportMode: "automatic" }),
    ).rejects.toThrow("requires at least two sessions");
  });

  it("validates all timing and laps before mutation and can retry safely", async () => {
    const encoder = new GarminFitEncoder("retry", "athlete");
    await encoder.initialize([], new Date(ORIGIN));
    const valid = [
      session({
        startTime: ORIGIN,
        endedAt: ORIGIN + 10_000,
        sport: "running",
        subSport: "street",
      }),
      session({
        startTime: ORIGIN + 10_000,
        endedAt: ORIGIN + 20_000,
        sport: "cycling",
        subSport: "road",
      }),
    ];
    const firstValid = valid[0];
    if (!firstValid) throw new Error("The fixture requires a first session.");
    const invalidInputs: FitSessionData[][] = [
      [{ ...firstValid, movingTime: 11_000 }],
      [{ ...firstValid, totalTime: 11_000 }],
      [{ ...firstValid, totalTime: Number.NaN }],
      [{ ...firstValid, avgSpeed: Number.NaN }],
      [{ ...firstValid, avgHeartRate: 255 }],
      [{ ...firstValid, totalAscent: 1.5 }],
      [{ ...firstValid, poolLengthUnit: 2 }],
      [
        {
          ...firstValid,
          totalTime: 8_000,
          timerEvents: [
            { type: "pause", timestamp: ORIGIN + 2_000 },
            { type: "resume", timestamp: ORIGIN + 3_000 },
          ],
        },
      ],
      [
        {
          ...firstValid,
          endedAt: ORIGIN + 20_000,
          totalTime: 20_000,
          movingTime: 20_000,
          laps: [
            {
              lapNumber: 1,
              startTime: ORIGIN,
              endedAt: ORIGIN + 12_000,
              totalTime: 12_000,
              distance: 10,
              avgSpeed: 1,
              maxSpeed: 1,
            },
            {
              lapNumber: 2,
              startTime: ORIGIN + 10_000,
              endedAt: ORIGIN + 20_000,
              totalTime: 10_000,
              distance: 10,
              avgSpeed: 1,
              maxSpeed: 1,
            },
          ],
        },
      ],
    ];
    for (const invalid of invalidInputs) {
      await expect(encoder.finalize(invalid)).rejects.toThrow();
    }

    await encoder.finalize(valid);
    const artifact = decodeFitActivityArtifact(await encoder.getFile());
    expect(artifact.sessions).toHaveLength(2);
    expect(artifact.laps).toHaveLength(2);
    expect(artifact.events.filter((event) => event.rawEvent === 0)).toHaveLength(4);
  });

  it("validates emitted contiguous swim lengths and supports retry after count mismatch", async () => {
    const encoder = new GarminFitEncoder("length-retry", "athlete");
    await encoder.initialize([], new Date(ORIGIN));
    for (const index of [0, 1]) {
      await encoder.addSwimLength({
        lengthIndex: index,
        startTime: new Date(ORIGIN + index * 10_000),
        endedAt: new Date(ORIGIN + (index + 1) * 10_000),
        movingTime: 10,
        strokeType: "freestyle",
        averageSpeed: 2.5,
        strokeCount: 10,
        totalActivityDistance: (index + 1) * 25,
      });
    }
    const base = session({
      startTime: ORIGIN,
      endedAt: ORIGIN + 20_000,
      distance: 50,
      sport: "swimming",
      subSport: "lap_swimming",
      poolLength: 25,
      poolLengthUnit: "metric",
    });
    await expect(
      encoder.finalize([{ ...base, numLengths: 1, numActiveLengths: 1 }]),
    ).rejects.toThrow("length counts do not match");
    await encoder.finalize([{ ...base, numLengths: 2, numActiveLengths: 2 }]);

    const activity = parseFitFileWithSDK(await encoder.getFile());
    expect(activity.lengths?.map((length) => length.messageIndex)).toEqual([0, 1]);
    expect(activity.lengths?.every((length) => length.sessionMessageIndex === 0)).toBe(true);
    expect(activity.laps?.[0]).toMatchObject({ sessionMessageIndex: 0 });
  });

  it("rejects duplicate or mismatched emitted length indexes before final messages", async () => {
    const duplicate = new GarminFitEncoder("duplicate-length", "athlete");
    await duplicate.initialize([], new Date(ORIGIN));
    for (const startOffset of [0, 10_000]) {
      await duplicate.addSwimLength({
        lengthIndex: 0,
        startTime: new Date(ORIGIN + startOffset),
        endedAt: new Date(ORIGIN + startOffset + 10_000),
        movingTime: 10,
        strokeType: "freestyle",
        averageSpeed: 2.5,
        strokeCount: 10,
        totalActivityDistance: startOffset === 0 ? 25 : 50,
      });
    }
    await expect(
      duplicate.finalize([
        session({
          startTime: ORIGIN,
          endedAt: ORIGIN + 20_000,
          distance: 50,
          sport: "swimming",
          subSport: "lap_swimming",
          poolLength: 25,
          numLengths: 2,
          numActiveLengths: 2,
        }),
      ]),
    ).rejects.toThrow("unique and contiguous");

    const mismatch = new GarminFitEncoder("mismatched-length", "athlete");
    await mismatch.initialize([], new Date(ORIGIN));
    for (const index of [0, 1]) {
      await mismatch.addSwimLength({
        lengthIndex: index,
        startTime: new Date(ORIGIN + index * 10_000),
        endedAt: new Date(ORIGIN + (index + 1) * 10_000),
        movingTime: 10,
        strokeType: "freestyle",
        averageSpeed: 2.5,
        strokeCount: 10,
        totalActivityDistance: (index + 1) * 25,
      });
    }
    await expect(
      mismatch.finalize([
        session({
          startTime: ORIGIN,
          endedAt: ORIGIN + 20_000,
          distance: 50,
          sport: "swimming",
          subSport: "lap_swimming",
          poolLength: 25,
          numLengths: 2,
          numActiveLengths: 2,
          laps: [
            {
              lapNumber: 1,
              startTime: ORIGIN,
              endedAt: ORIGIN + 20_000,
              totalTime: 20_000,
              distance: 50,
              avgSpeed: 2.5,
              maxSpeed: 2.5,
              firstLengthIndex: 1,
              numLengths: 2,
              numActiveLengths: 2,
            },
          ],
        }),
      ]),
    ).rejects.toThrow("length range is invalid");
  });

  it("rejects invalid record fields before mutation", async () => {
    const encoder = new GarminFitEncoder("record-validation", "athlete");
    await encoder.initialize([], new Date(ORIGIN));
    await expect(encoder.addRecord({ timestamp: ORIGIN, heartRate: 255 })).rejects.toThrow(
      "heartRate",
    );
    await encoder.addRecord({ timestamp: ORIGIN, heartRate: 150, distance: 0 });
    await encoder.finalize({
      startTime: ORIGIN,
      endedAt: ORIGIN + 10_000,
      totalTime: 10_000,
      distance: 0,
      avgSpeed: 0,
      maxSpeed: 0,
      sport: "running",
      subSport: "street",
    });
    expect(parseFitFileWithSDK(await encoder.getFile()).records).toHaveLength(1);
  });

  it("round-trips an unknown numeric sport without replacing the file format", async () => {
    const bytes = await encode(
      [
        session({
          startTime: ORIGIN,
          endedAt: ORIGIN + 10_000,
          sport: 200,
          subSport: 201,
          role: "unknown",
        }),
      ],
      "unknown",
    );
    expect(projectFitArtifactSemantics(decodeFitActivityArtifact(bytes)).segments[0]).toMatchObject(
      {
        role: "unknown",
        rawSport: 200,
        rawSubSport: 201,
      },
    );
  });

  it("fails explicitly for rest sessions, unsupported sport strings, and invalid lap swims", async () => {
    const rest = new GarminFitEncoder("rest", "athlete");
    await rest.initialize([], new Date(ORIGIN));
    await expect(
      rest.finalize([
        session({
          startTime: ORIGIN,
          endedAt: ORIGIN + 10_000,
          sport: "generic",
          subSport: "generic",
          role: "rest",
        }),
      ]),
    ).rejects.toThrow("cannot represent a rest segment");

    const unknown = new GarminFitEncoder("unsupported", "athlete");
    await unknown.initialize([], new Date(ORIGIN));
    await expect(
      unknown.finalize([
        session({
          startTime: ORIGIN,
          endedAt: ORIGIN + 10_000,
          sport: "vendor_sport",
          subSport: "generic",
        }),
      ]),
    ).rejects.toThrow("Unsupported FIT sport");

    const swim = new GarminFitEncoder("invalid-swim", "athlete");
    await swim.initialize([], new Date(ORIGIN));
    await expect(
      swim.finalize([
        session({
          startTime: ORIGIN,
          endedAt: ORIGIN + 10_000,
          sport: "swimming",
          subSport: "lap_swimming",
        }),
      ]),
    ).rejects.toThrow("require a positive poolLength");
  });
});
