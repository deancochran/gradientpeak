import { describe, expect, it } from "vitest";
import { inferActivityFileType, parseActivityFile } from "./activity-file-parser";

describe("activity-file-parser", () => {
  it("normalizes GPX activity records", () => {
    const activity = parseActivityFile({
      data: `<gpx><trk><name>Morning Run</name><trkseg>
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
  });

  it("sniffs XML activity files by content", () => {
    expect(
      inferActivityFileType(
        "activity.xml",
        `<?xml version="1.0"?><TrainingCenterDatabase></TrainingCenterDatabase>`,
      ),
    ).toBe("tcx");
  });
});
