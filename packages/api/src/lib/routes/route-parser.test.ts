import { describe, expect, it } from "vitest";
import { parseRoute } from "./route-parser";

describe("route-parser", () => {
  it("extracts elevation from TCX trackpoints", () => {
    const route = parseRoute(
      `<?xml version="1.0" encoding="UTF-8"?>
      <TrainingCenterDatabase>
        <Courses>
          <Course>
            <Name>MLK Out And Back</Name>
            <Track>
              <Trackpoint>
                <Position>
                  <LatitudeDegrees>40.1</LatitudeDegrees>
                  <LongitudeDegrees>-74.1</LongitudeDegrees>
                </Position>
                <AltitudeMeters>12.5</AltitudeMeters>
              </Trackpoint>
              <Trackpoint>
                <Position>
                  <LatitudeDegrees>40.2</LatitudeDegrees>
                  <LongitudeDegrees>-74.2</LongitudeDegrees>
                </Position>
                <AltitudeMeters>36</AltitudeMeters>
              </Trackpoint>
            </Track>
          </Course>
        </Courses>
      </TrainingCenterDatabase>`,
      "tcx",
    );

    expect(route.name).toBe("MLK Out And Back");
    expect(route.coordinates).toEqual([
      { latitude: 40.1, longitude: -74.1, altitude: 12.5 },
      { latitude: 40.2, longitude: -74.2, altitude: 36 },
    ]);
  });

  it("keeps zero elevation values from GPX files", () => {
    const route = parseRoute(
      `<gpx><trk><trkseg><trkpt lat="40.1" lon="-74.1"><ele>0</ele></trkpt><trkpt lat="40.2" lon="-74.2"><ele>10</ele></trkpt></trkseg></trk></gpx>`,
      "gpx",
    );

    expect(route.coordinates[0]).toEqual({ latitude: 40.1, longitude: -74.1, altitude: 0 });
  });
});
