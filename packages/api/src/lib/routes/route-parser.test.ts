import { MAX_ROUTE_POINT_COUNT } from "@repo/core/route-files";
import { describe, expect, it } from "vitest";
import { parseRoute, validateRoute } from "./route-parser";

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

  it("detects TCX content when uploaded with an XML extension", () => {
    const route = parseRoute(
      `<?xml version="1.0" encoding="UTF-8"?>
      <TrainingCenterDatabase>
        <Courses><Course><Track>
          <Trackpoint><Position><LatitudeDegrees>40.1</LatitudeDegrees><LongitudeDegrees>-74.1</LongitudeDegrees></Position></Trackpoint>
          <Trackpoint><Position><LatitudeDegrees>40.2</LatitudeDegrees><LongitudeDegrees>-74.2</LongitudeDegrees></Position></Trackpoint>
        </Track></Course></Courses>
      </TrainingCenterDatabase>`,
    );

    expect(route.coordinates).toHaveLength(2);
  });

  it.each([
    `<wrapper><gpx><trk><trkseg><trkpt lat="1" lon="2" /></trkseg></trk></gpx></wrapper>`,
    `<wrapper><!-- <gpx> --><value>&lt;TrainingCenterDatabase&gt;</value></wrapper>`,
  ])("rejects wrapper roots even when route tags appear elsewhere", (content) => {
    expect(() => parseRoute(content)).toThrow("Unsupported route file root element");
  });

  it("rejects malformed XML", () => {
    expect(() => parseRoute(`<gpx><trk><trkseg></gpx>`)).toThrow(
      "Invalid route file: XML parsing error",
    );
  });

  it("accepts namespace-prefixed GPX roots and elements", () => {
    const route = parseRoute(
      `<r:gpx xmlns:r="urn:gpx"><r:trk><r:trkseg><r:trkpt lat="40.1" lon="-74.1"/><r:trkpt lat="40.2" lon="-74.2"/></r:trkseg></r:trk></r:gpx>`,
      "gpx",
    );
    expect(route.coordinates).toHaveLength(2);
  });

  it("accepts namespace-prefixed TCX roots and elements", () => {
    const route = parseRoute(
      `<t:TrainingCenterDatabase xmlns:t="urn:tcx"><t:Courses><t:Course><t:Track><t:Trackpoint><t:Position><t:LatitudeDegrees>40.1</t:LatitudeDegrees><t:LongitudeDegrees>-74.1</t:LongitudeDegrees></t:Position></t:Trackpoint><t:Trackpoint><t:Position><t:LatitudeDegrees>40.2</t:LatitudeDegrees><t:LongitudeDegrees>-74.2</t:LongitudeDegrees></t:Position></t:Trackpoint></t:Track></t:Course></t:Courses></t:TrainingCenterDatabase>`,
      "tcx",
    );
    expect(route.coordinates).toHaveLength(2);
  });

  it("rejects a valid route root when the declared format mismatches", () => {
    expect(() =>
      parseRoute(
        `<TrainingCenterDatabase><Courses><Course><Track /></Course></Courses></TrainingCenterDatabase>`,
        "gpx",
      ),
    ).toThrow("Route file extension does not match its content");
  });

  it.each([
    `<!DOCTYPE gpx><gpx><trk><trkseg><trkpt lat="1" lon="2" /></trkseg></trk></gpx>`,
    `<!ENTITY x "unsafe"><gpx><trk><trkseg><trkpt lat="1" lon="2" /></trkseg></trk></gpx>`,
  ])("rejects DTD and entity declarations before parsing", (content) => {
    expect(() => parseRoute(content)).toThrow("Route XML declarations are not allowed");
  });

  it("stops coordinate collection when the route exceeds the point cap", () => {
    const points = '<trkpt lat="1" lon="2" />'.repeat(MAX_ROUTE_POINT_COUNT + 1);
    expect(() => parseRoute(`<gpx><trk><trkseg>${points}</trkseg></trk></gpx>`, "gpx")).toThrow(
      `Route exceeds the ${MAX_ROUTE_POINT_COUNT} point limit`,
    );
  });

  it("defense-in-depth validation rejects routes over the point cap", () => {
    const coordinate = { latitude: 1, longitude: 2 };
    expect(
      validateRoute({
        coordinates: Array.from({ length: MAX_ROUTE_POINT_COUNT + 1 }, () => coordinate),
      }),
    ).toMatchObject({ valid: false });
  });
});
