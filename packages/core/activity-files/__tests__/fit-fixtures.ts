import { Encoder, Profile, Utils } from "@garmin/fitsdk";

export type FitFixtureSession = {
  sport: number;
  subSport?: number;
  elapsedSeconds: number;
  timerSeconds?: number;
  distanceMeters?: number;
  pause?: { startSeconds: number; endSeconds: number };
  pauseEventType?: 1 | 8 | 9;
  poolLength?: number;
  emitLengthBoundaryRecord?: boolean;
  emitUnownedRecord?: boolean;
  unownedLap?: boolean;
};

const ORIGIN_MS = Date.parse("2026-01-01T10:00:00.000Z");

const fitTime = (milliseconds: number) => Utils.convertDateToDateTime(new Date(milliseconds));

/** Deterministic official-SDK fixtures; each session owns one lap and two records. */
export function buildFitFixture(sessions: readonly FitFixtureSession[]): Uint8Array {
  const encoder = new Encoder();
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.FILE_ID,
    type: 4,
    manufacturer: 255,
    product: 1,
    timeCreated: fitTime(ORIGIN_MS),
    serialNumber: 123,
  });
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.EVENT,
    timestamp: fitTime(ORIGIN_MS),
    event: 0,
    eventType: 0,
  });

  let cursorMs = ORIGIN_MS;
  let totalTimerSeconds = 0;
  sessions.forEach((session, index) => {
    const startMs = cursorMs;
    const endMs = startMs + session.elapsedSeconds * 1000;
    const timerSeconds = session.timerSeconds ?? session.elapsedSeconds;
    totalTimerSeconds += timerSeconds;
    encoder.writeMesg({
      mesgNum: Profile.MesgNum.RECORD,
      timestamp: fitTime(startMs),
      distance: 0,
      heartRate: 120 + index,
    });
    encoder.writeMesg({
      mesgNum: Profile.MesgNum.RECORD,
      timestamp: fitTime(endMs - 1000),
      distance: session.distanceMeters ?? 0,
      heartRate: 130 + index,
    });
    if (session.pause) {
      encoder.writeMesg({
        mesgNum: Profile.MesgNum.EVENT,
        timestamp: fitTime(startMs + session.pause.startSeconds * 1000),
        event: 0,
        eventType: session.pauseEventType ?? 1,
      });
      encoder.writeMesg({
        mesgNum: Profile.MesgNum.EVENT,
        timestamp: fitTime(startMs + session.pause.endSeconds * 1000),
        event: 0,
        eventType: 0,
      });
    }
    if (session.sport === 5 && session.subSport === 17) {
      encoder.writeMesg({
        mesgNum: Profile.MesgNum.LENGTH,
        messageIndex: 0,
        timestamp: fitTime(endMs),
        startTime: fitTime(startMs),
        totalElapsedTime: session.elapsedSeconds,
        totalTimerTime: timerSeconds,
        totalStrokes: 20,
        avgSpeed: (session.distanceMeters ?? session.poolLength ?? 25) / timerSeconds,
        lengthType: 1,
        swimStroke: 0,
        event: 28,
        eventType: 1,
      });
      if (session.emitLengthBoundaryRecord) {
        encoder.writeMesg({
          mesgNum: Profile.MesgNum.RECORD,
          timestamp: fitTime(endMs),
          distance: session.distanceMeters ?? session.poolLength ?? 0,
        });
      }
    }
    encoder.writeMesg({
      mesgNum: Profile.MesgNum.LAP,
      messageIndex: session.unownedLap ? 999 : index,
      timestamp: fitTime(session.unownedLap ? endMs + 3_600_000 : endMs),
      startTime: fitTime(session.unownedLap ? endMs + 3_599_000 : startMs),
      totalElapsedTime: session.elapsedSeconds,
      totalTimerTime: timerSeconds,
      totalDistance: session.distanceMeters ?? 0,
      ...(index === 0 && session.sport === 1
        ? {
            avgSpeed: 3.25,
            maxSpeed: 4.5,
            avgHeartRate: 145,
            maxHeartRate: 170,
            avgCadence: 82,
            maxCadence: 96,
            avgPower: 240,
            maxPower: 410,
          }
        : {}),
      event: 9,
      eventType: 1,
      sport: session.sport,
      subSport: session.subSport ?? 0,
      ...(session.sport === 5 && session.subSport === 17
        ? { firstLengthIndex: 0, numLengths: 1, numActiveLengths: 1, swimStroke: 0 }
        : {}),
    });
    encoder.writeMesg({
      mesgNum: Profile.MesgNum.SESSION,
      messageIndex: index,
      timestamp: fitTime(endMs),
      startTime: fitTime(startMs),
      totalElapsedTime: session.elapsedSeconds,
      totalTimerTime: timerSeconds,
      totalMovingTime: timerSeconds,
      totalDistance: session.distanceMeters ?? 0,
      ...(index === 0 && session.sport === 1
        ? {
            avgSpeed: 3.25,
            maxSpeed: 4.5,
            avgHeartRate: 145,
            maxHeartRate: 170,
            avgCadence: 82,
            maxCadence: 96,
            avgPower: 240,
            maxPower: 410,
          }
        : {}),
      sport: session.sport,
      subSport: session.subSport ?? 0,
      firstLapIndex: index,
      numLaps: 1,
      event: 8,
      eventType: 1,
      trigger: index === sessions.length - 1 ? 0 : 2,
      ...(session.poolLength === undefined
        ? {}
        : {
            poolLength: session.poolLength,
            poolLengthUnit: 0,
            numLengths: 1,
            numActiveLengths: 1,
            totalStrokes: 20,
          }),
    });
    encoder.writeMesg({
      mesgNum: Profile.MesgNum.EVENT,
      timestamp: fitTime(endMs),
      event: 0,
      eventType: index === sessions.length - 1 ? 4 : 1,
    });
    if (session.emitUnownedRecord) {
      encoder.writeMesg({
        mesgNum: Profile.MesgNum.RECORD,
        timestamp: fitTime(endMs + 3_600_000),
        distance: session.distanceMeters ?? 0,
      });
    }
    cursorMs = endMs;
    if (index < sessions.length - 1) {
      encoder.writeMesg({
        mesgNum: Profile.MesgNum.EVENT,
        timestamp: fitTime(cursorMs),
        event: 0,
        eventType: 0,
      });
    }
  });
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.ACTIVITY,
    timestamp: fitTime(cursorMs),
    totalTimerTime: totalTimerSeconds,
    numSessions: sessions.length,
    type: sessions.length > 1 ? 1 : 0,
    event: 26,
    eventType: 1,
  });
  return encoder.close();
}

export const fitFixtures = {
  singleRun: () =>
    buildFitFixture([{ sport: 1, subSport: 2, elapsedSeconds: 60, distanceMeters: 200 }]),
  swim: () =>
    buildFitFixture([
      { sport: 5, subSport: 17, elapsedSeconds: 30, distanceMeters: 25, poolLength: 25 },
    ]),
  triathlon: () =>
    buildFitFixture([
      { sport: 5, subSport: 18, elapsedSeconds: 60, distanceMeters: 100 },
      { sport: 3, subSport: 34, elapsedSeconds: 10 },
      { sport: 2, subSport: 7, elapsedSeconds: 90, distanceMeters: 1000 },
      { sport: 3, subSport: 32, elapsedSeconds: 8 },
      { sport: 1, subSport: 2, elapsedSeconds: 70, distanceMeters: 300 },
    ]),
  repeatedSport: () =>
    buildFitFixture([
      { sport: 1, subSport: 2, elapsedSeconds: 30, distanceMeters: 100 },
      { sport: 3, subSport: 33, elapsedSeconds: 5 },
      { sport: 1, subSport: 3, elapsedSeconds: 40, distanceMeters: 120 },
    ]),
  pausedRun: () =>
    buildFitFixture([
      {
        sport: 1,
        subSport: 2,
        elapsedSeconds: 60,
        timerSeconds: 50,
        distanceMeters: 200,
        pause: { startSeconds: 20, endSeconds: 30 },
      },
    ]),
  stopDisableRun: (pauseEventType: 8 | 9) =>
    buildFitFixture([
      {
        sport: 1,
        subSport: 2,
        elapsedSeconds: 60,
        timerSeconds: 50,
        distanceMeters: 200,
        pause: { startSeconds: 20, endSeconds: 30 },
        pauseEventType,
      },
    ]),
  unknownSport: () => buildFitFixture([{ sport: 200, elapsedSeconds: 20 }]),
  knownOtherSport: () => buildFitFixture([{ sport: 6, elapsedSeconds: 20 }]),
  exactSwimBoundary: () =>
    buildFitFixture([
      {
        sport: 5,
        subSport: 17,
        elapsedSeconds: 30,
        distanceMeters: 25,
        poolLength: 25,
        emitLengthBoundaryRecord: true,
      },
      { sport: 3, subSport: 34, elapsedSeconds: 5 },
    ]),
  sparse: () => buildFitFixture([{ sport: 1, elapsedSeconds: 1 }]),
  unownedEvidence: () =>
    buildFitFixture([
      {
        sport: 1,
        subSport: 2,
        elapsedSeconds: 60,
        distanceMeters: 200,
        emitUnownedRecord: true,
        unownedLap: true,
      },
    ]),
} as const;
