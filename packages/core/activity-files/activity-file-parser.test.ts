import { describe, expect, it } from "vitest";
import { inferActivityFileType, parseActivityFile } from "./activity-file-parser";

describe("activity-file-parser", () => {
  it("normalizes GPX activity records", () => {
    const activity = parseActivityFile({
      data: `<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk><name>Morning Run</name><type>running</type><trkseg>
        <trkpt lat="40.1" lon="-74.1"><ele>10</ele><time>2026-01-01T10:00:00Z</time><extensions><gpxtpx:hr>150</gpxtpx:hr><power>220</power></extensions></trkpt>
        <trkpt lat="40.2" lon="-74.2"><ele>20</ele><time>2026-01-01T10:10:00Z</time><extensions><gpxtpx:hr>160</gpxtpx:hr><power>240</power></extensions></trkpt>
      </trkseg></trk></gpx>`,
      fileName: "morning.gpx",
    });

    expect(activity.metadata.name).toBe("Morning Run");
    expect(activity.summary.totalTime).toBe(600);
    expect(activity.summary.avgHeartRate).toBe(155);
    expect(activity.summary.avgPower).toBe(230);
    expect(activity.records).toHaveLength(2);
    expect(activity.records.map((record) => record.sessionMessageIndex)).toEqual([0, 0]);
    expect(activity.segments).toEqual([
      {
        sessionMessageIndex: 0,
        role: "activity",
        rawSport: "running",
        startTime: new Date("2026-01-01T10:00:00.000Z"),
        endTime: new Date("2026-01-01T10:10:00.000Z"),
      },
    ]);
  });

  it("normalizes TCX activity records", () => {
    const activity = parseActivityFile({
      data: `<TrainingCenterDatabase><Activities><Activity Sport="Biking"><Id>Ride</Id><Lap><Calories>500</Calories><Track>
        <Trackpoint><Time>2026-01-01T10:00:00Z</Time><Position><LatitudeDegrees>40.1</LatitudeDegrees><LongitudeDegrees>-74.1</LongitudeDegrees></Position><DistanceMeters>0</DistanceMeters><HeartRateBpm><Value>140</Value></HeartRateBpm><Cadence>80</Cadence><Extensions><TPX><Watts>210</Watts></TPX></Extensions></Trackpoint>
        <Trackpoint><Time>2026-01-01T10:30:00Z</Time><Position><LatitudeDegrees>40.2</LatitudeDegrees><LongitudeDegrees>-74.2</LongitudeDegrees></Position><DistanceMeters>12000</DistanceMeters><HeartRateBpm><Value>160</Value></HeartRateBpm><Cadence>90</Cadence><Extensions><TPX><Watts>250</Watts></TPX></Extensions></Trackpoint>
      </Track></Lap></Activity></Activities></TrainingCenterDatabase>`,
      fileName: "ride.tcx",
    });

    expect(activity.metadata.type).toBe("biking");
    expect(activity.summary.totalTime).toBe(1800);
    expect(activity.summary.totalDistance).toBe(12000);
    expect(activity.summary.calories).toBe(500);
    expect(activity.summary.avgCadence).toBe(85);
    expect(activity.segments?.[0]).toMatchObject({
      sessionMessageIndex: 0,
      role: "activity",
      rawSport: "cycling",
    });
  });

  it("sniffs XML activity files by content", () => {
    expect(
      inferActivityFileType(
        "activity.xml",
        `<?xml version="1.0"?><TrainingCenterDatabase></TrainingCenterDatabase>`,
      ),
    ).toBe("tcx");
  });

  it("rejects multiple GPX tracks instead of collapsing distinct activities", () => {
    expect(() =>
      parseActivityFile({
        data: `<gpx><trk><trkseg><trkpt lat="40.1" lon="-74.1"><time>2026-01-01T10:00:00Z</time></trkpt></trkseg></trk><trk><trkseg><trkpt lat="41.1" lon="-75.1"><time>2026-01-02T10:00:00Z</time></trkpt></trkseg></trk></gpx>`,
        fileName: "multiple.gpx",
      }),
    ).toThrow("GPX activity files must contain exactly one <trk> activity");
  });

  it("rejects multiple TCX activities instead of assigning every record to one session", () => {
    expect(() =>
      parseActivityFile({
        data: `<TrainingCenterDatabase><Activities><Activity Sport="Running"><Id>Run</Id></Activity><Activity Sport="Biking"><Id>Ride</Id></Activity></Activities></TrainingCenterDatabase>`,
        fileName: "multiple.tcx",
      }),
    ).toThrow("TCX activity files must contain exactly one <Activity>");
  });
});
