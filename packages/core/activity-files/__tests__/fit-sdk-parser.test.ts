import { Encoder, Profile, Utils } from "@garmin/fitsdk";
import { describe, expect, it } from "vitest";

import { compareActivityArtifactSemantics } from "../../activity-artifacts";
import {
  decodeFitActivityArtifact,
  parseFitFileWithSDK,
  projectFitArtifactSemantics,
  safeDecodeFitFile,
} from "../../lib/fit-sdk-parser";
import { fitFixtures } from "./fit-fixtures";

describe("standards-first FIT decoding", () => {
  it("preserves ordinary single-session run behavior and ownership", () => {
    const activity = parseFitFileWithSDK(fitFixtures.singleRun());

    expect(activity.metadata.type).toBe("running");
    expect(activity.metadata.subType).toBe("street");
    expect(activity.metadata.manufacturer).toBe("development");
    expect(activity.summary).toMatchObject({
      avgSpeed: 3.25,
      maxSpeed: 4.5,
      avgHeartRate: 145,
      maxHeartRate: 170,
      avgCadence: 82,
      maxCadence: 96,
      avgPower: 240,
      maxPower: 410,
    });
    expect(activity.sessions).toHaveLength(1);
    expect(activity.laps).toHaveLength(1);
    expect(activity.records).toHaveLength(2);
    expect(activity.records.every((record) => record.sessionMessageIndex === 0)).toBe(true);
    expect(activity.decodedArtifact?.sessions[0]).toMatchObject({
      messageIndex: 0,
      rawSport: 1,
      rawSubSport: 2,
    });
  });

  it("decodes a lap swim with pool, length, lap, and record evidence", () => {
    const activity = parseFitFileWithSDK(fitFixtures.swim());

    expect(activity.metadata.type).toBe("swimming");
    expect(activity.summary.poolLength).toBe(25);
    expect(activity.summary.poolLengthUnit).toBe("metric");
    expect(activity.lengths).toHaveLength(1);
    expect(activity.lengths?.[0]).toMatchObject({
      messageIndex: 0,
      sessionMessageIndex: 0,
      lapMessageIndex: 0,
      totalStrokes: 20,
      swimStroke: "freestyle",
      event: "length",
      eventType: "stop",
    });
    expect(activity.records).toHaveLength(2);
  });

  it("keeps triathlon transitions and all message ownership in source order", () => {
    const artifact = decodeFitActivityArtifact(fitFixtures.triathlon());
    const semantics = projectFitArtifactSemantics(artifact);

    expect(artifact.sessions.map((session) => session.rawSport)).toEqual([5, 3, 2, 3, 1]);
    expect(artifact.laps.map((lap) => lap.sessionMessageIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(
      artifact.recordCollections.flatMap((collection) =>
        collection.storage === "inline"
          ? collection.records.map((record) => record.sessionMessageIndex)
          : [],
      ),
    ).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect(semantics.segments.map((segment) => segment.role)).toEqual([
      "activity",
      "transition",
      "activity",
      "transition",
      "activity",
    ]);
  });

  it("keeps a paired final swim record in the prior session at an exact boundary", () => {
    const artifact = decodeFitActivityArtifact(fitFixtures.exactSwimBoundary());
    const boundary = artifact.sessions[0]?.endTimeMs;
    const owners = artifact.recordCollections.flatMap((collection) =>
      collection.storage === "inline"
        ? collection.records
            .filter((record) => record.timestampMs === boundary)
            .map((record) => record.sessionMessageIndex)
        : [],
    );
    expect(owners).toEqual([0, 1]);
  });

  it("keeps valid activity evidence when laps or records cannot be assigned", () => {
    const artifact = decodeFitActivityArtifact(fitFixtures.unownedEvidence());

    expect(artifact.sessions).toHaveLength(1);
    expect(artifact.laps).toEqual([]);
    expect(
      artifact.recordCollections.flatMap((collection) =>
        collection.storage === "inline" ? collection.records : [],
      ),
    ).toHaveLength(2);
    expect(artifact.extensions).toMatchObject({
      "fit.unownedLapCount": 1,
      "fit.unownedLapMessageIndexes": [999],
      "fit.unownedRecordCount": 1,
      "fit.unownedRecordMessageIndexes": [2],
    });
  });

  it("does not collapse repeated sports", () => {
    const semantics = projectFitArtifactSemantics(
      decodeFitActivityArtifact(fitFixtures.repeatedSport()),
    );
    expect(semantics.segments.map((segment) => segment.rawSport)).toEqual([1, 3, 1]);
    expect(semantics.segments).toHaveLength(3);
  });

  it("retains sessions when optional FIT summaries contradict timestamp bounds", () => {
    const artifact = decodeFitActivityArtifact(fitFixtures.singleRun());
    const session = artifact.sessions[0];
    if (!session?.extensions || session.endTimeMs === undefined) {
      throw new Error("Expected a bounded fixture session with summary extensions.");
    }
    session.extensions["fit.totalTimerTime"] = 61;
    session.extensions["fit.totalMovingTime"] = 62;
    session.extensions["fit.totalDistance"] = -1;
    artifact.activity.endTimeMs = session.endTimeMs - 1_000;

    const semantics = projectFitArtifactSemantics(artifact);

    expect(semantics.segments[0]).not.toHaveProperty("activeMs");
    expect(semantics.segments[0]).not.toHaveProperty("movingMs");
    expect(semantics.segments[0]).not.toHaveProperty("distanceMeters");
    expect(semantics.totals.elapsedMs).toBe(60_000);
  });

  it("preserves edge transition source identity without asserting invalid transition semantics", () => {
    const artifact = decodeFitActivityArtifact(fitFixtures.repeatedSport());
    const firstSession = artifact.sessions[0];
    if (!firstSession) throw new Error("Expected a multisport fixture session.");
    firstSession.rawSport = 3;

    const semantics = projectFitArtifactSemantics(artifact);

    expect(semantics.segments[0]).toMatchObject({ role: "unknown", rawSport: 3 });
    expect(semantics.segments[1]).toMatchObject({ role: "unknown", rawSport: 3 });
    expect(semantics.segments[2]).toMatchObject({ role: "activity", category: "run" });
  });

  it("projects pause/resume ranges and timer events", () => {
    const semantics = projectFitArtifactSemantics(
      decodeFitActivityArtifact(fitFixtures.pausedRun()),
    );
    expect(semantics.segments[0]).toMatchObject({
      activeMs: 50_000,
      movingMs: 50_000,
      pauseRanges: [{ startOffsetMs: 20_000, endOffsetMs: 30_000 }],
      timerEvents: [
        { type: "start", offsetMs: 0 },
        { type: "pause", offsetMs: 20_000 },
        { type: "resume", offsetMs: 30_000 },
        { type: "stop", offsetMs: 60_000 },
      ],
    });
  });

  it("preserves unknown raw sport values as unknown semantics", () => {
    const semantics = projectFitArtifactSemantics(
      decodeFitActivityArtifact(fitFixtures.unknownSport()),
    );
    expect(semantics.segments[0]).toMatchObject({ role: "unknown", rawSport: 200 });
  });

  it("maps known uncategorized official sports to other while retaining identity", () => {
    const activity = parseFitFileWithSDK(fitFixtures.knownOtherSport());
    expect(activity.metadata.type).toBe("basketball");
    expect(activity.semantics?.segments[0]).toMatchObject({
      role: "activity",
      category: "other",
      rawSport: 6,
    });
  });

  it("recognizes official timer stopDisable variants as pause evidence", () => {
    for (const eventType of [8, 9] as const) {
      const artifact = decodeFitActivityArtifact(fitFixtures.stopDisableRun(eventType));
      const semantics = projectFitArtifactSemantics(artifact);
      expect(artifact.events.some((event) => event.rawEventType === eventType)).toBe(true);
      expect(semantics.segments[0]).toMatchObject({
        pauseRanges: [{ startOffsetMs: 20_000, endOffsetMs: 30_000 }],
        timerEvents: [
          { type: "start", offsetMs: 0 },
          { type: "pause", offsetMs: 20_000 },
          { type: "resume", offsetMs: 30_000 },
          { type: "stop", offsetMs: 60_000 },
        ],
      });
    }
  });

  it("accepts sparse but valid session evidence", () => {
    const activity = parseFitFileWithSDK(fitFixtures.sparse());
    expect(activity.sessions).toHaveLength(1);
    expect(activity.summary.totalTime).toBe(1);
  });

  it("compares expected semantics to an official-SDK encoded and decoded artifact", () => {
    const actual = projectFitArtifactSemantics(decodeFitActivityArtifact(fitFixtures.pausedRun()));
    const expected = {
      segments: [
        {
          role: "activity",
          category: "run",
          rawSport: 1,
          rawSubSport: 2,
          startOffsetMs: 0,
          endOffsetMs: 60_000,
          activeMs: 50_000,
          movingMs: 50_000,
          distanceMeters: 200,
          pauseRanges: [{ startOffsetMs: 20_000, endOffsetMs: 30_000 }],
          timerEvents: [
            { type: "start", offsetMs: 0 },
            { type: "pause", offsetMs: 20_000 },
            { type: "resume", offsetMs: 30_000 },
            { type: "stop", offsetMs: 60_000 },
          ],
        },
      ],
      totals: { elapsedMs: 60_000, activeMs: 50_000, movingMs: 50_000, distanceMeters: 200 },
    };
    expect(compareActivityArtifactSemantics({ expected, actual })).toEqual({
      equivalent: true,
      differences: [],
    });
  });

  it("fails explicitly for malformed bytes and a valid FIT file without sessions", () => {
    expect(safeDecodeFitFile(Buffer.from([1, 2, 3])).errors[0]?.type).toBe("format");
    expect(() => decodeFitActivityArtifact(new Uint8Array([1, 2, 3]))).toThrow(
      "Failed to decode FIT file",
    );

    const encoder = new Encoder();
    encoder.writeMesg({
      mesgNum: Profile.MesgNum.FILE_ID,
      type: 4,
      manufacturer: 255,
      product: 1,
      timeCreated: Utils.convertDateToDateTime(new Date("2026-01-01T00:00:00Z")),
    });
    expect(() => decodeFitActivityArtifact(encoder.close())).toThrow("No session message found");
  });
});
