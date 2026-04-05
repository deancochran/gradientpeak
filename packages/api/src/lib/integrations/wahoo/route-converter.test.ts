import { describe, expect, it } from "vitest";
import {
  extractStartCoordinates,
  getWorkoutTypeFamilyForRoute,
  prepareGPXForWahoo,
  validateRouteForWahoo,
} from "./route-converter";

describe("route-converter", () => {
  it("base64 encodes GPX content for Wahoo upload", () => {
    const gpx = '<?xml version="1.0"?><gpx><trk><name>Morning Ride</name></trk></gpx>';

    expect(prepareGPXForWahoo(gpx)).toBe(Buffer.from(gpx).toString("base64"));
  });

  it("extracts the first trackpoint coordinates from GPX content", () => {
    const gpx = `
      <gpx>
        <trk>
          <trkseg>
            <trkpt lat="35.2271" lon="-80.8431"><ele>210</ele></trkpt>
            <trkpt lat="35.3000" lon="-80.9000"></trkpt>
          </trkseg>
        </trk>
      </gpx>
    `;

    expect(extractStartCoordinates(gpx)).toEqual({
      latitude: 35.2271,
      longitude: -80.8431,
    });
  });

  it("returns null when GPX content has no trackpoints", () => {
    expect(extractStartCoordinates("<gpx><trk></trk></gpx>")).toBeNull();
  });

  it("rejects unsupported route activity types while preserving distance warnings", () => {
    expect(
      validateRouteForWahoo({
        filePath: "routes/pool-session.gpx",
        name: "Pool Session",
        activityType: "swim",
        totalDistance: 80,
      }),
    ).toEqual({
      valid: false,
      errors: [
        "Activity type 'swim' does not support routes in Wahoo. Only bike and run support routes.",
      ],
      warnings: ["Route is very short (less than 100 meters)"],
    });
  });

  it("accepts supported routes and warns when they exceed Wahoo-friendly distance bounds", () => {
    expect(
      validateRouteForWahoo({
        filePath: "routes/century.gpx",
        name: "Big Day Out",
        activityType: "bike",
        totalDistance: 500001,
      }),
    ).toEqual({
      valid: true,
      errors: [],
      warnings: ["Route is very long (more than 500km)"],
    });
  });

  it.each([
    { activityType: "bike" as const, expected: 0 },
    { activityType: "run" as const, expected: 1 },
    { activityType: "swim" as const, expected: 0 },
  ])("maps $activityType routes to workout family $expected", ({ activityType, expected }) => {
    expect(getWorkoutTypeFamilyForRoute(activityType)).toBe(expected);
  });
});
