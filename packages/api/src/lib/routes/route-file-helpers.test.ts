import { describe, expect, it } from "vitest";
import {
  buildRouteFileArtifacts,
  getCanonicalRouteStorageFormat,
  parseStoredRouteFile,
  resolveRouteContentFormat,
} from "./route-file-helpers";

const gpx = `<gpx><trk><trkseg><trkpt lat="40.1" lon="-74.1"/><trkpt lat="40.2" lon="-74.2"/></trkseg></trk></gpx>`;
const tcx = `<TrainingCenterDatabase><Courses><Course><Track><Trackpoint><Position><LatitudeDegrees>40.1</LatitudeDegrees><LongitudeDegrees>-74.1</LongitudeDegrees></Position></Trackpoint><Trackpoint><Position><LatitudeDegrees>40.2</LatitudeDegrees><LongitudeDegrees>-74.2</LongitudeDegrees></Position></Trackpoint></Track></Course></Courses></TrainingCenterDatabase>`;

describe("route file helpers", () => {
  it("requires specific extensions to match content", () => {
    expect(() => resolveRouteContentFormat("route.gpx", tcx)).toThrow(
      "Route file extension does not match its content",
    );
    expect(() => resolveRouteContentFormat("route.tcx", gpx)).toThrow(
      "Route file extension does not match its content",
    );
  });

  it("sniffs XML and returns canonical storage format", () => {
    const format = resolveRouteContentFormat("route.xml", tcx);
    expect(format).toBe("tcx");
    expect(getCanonicalRouteStorageFormat(format)).toEqual({
      extension: "tcx",
      mimeType: "application/vnd.garmin.tcx+xml",
    });
  });

  it("fully validates stored routes rather than only their parsed shape", () => {
    const onePoint = `<gpx><trk><trkseg><trkpt lat="40.1" lon="-74.1"/></trkseg></trk></gpx>`;
    expect(() => parseStoredRouteFile(onePoint, "route.gpx")).toThrow(
      "Stored route file contained invalid route data",
    );
  });

  it("builds validated artifacts with the effective format", () => {
    expect(buildRouteFileArtifacts(gpx, "route.xml").format).toBe("gpx");
  });
});
