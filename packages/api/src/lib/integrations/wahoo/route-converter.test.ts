import { describe, expect, it } from "vitest";
import {
  extractStartCoordinates,
  getWorkoutTypeFamilyForRoute,
  hasValidRouteStartCoordinates,
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

  it("rejects unsupported route activity categories while preserving distance warnings", () => {
    expect(
      validateRouteForWahoo({
        filePath: "routes/pool-session.gpx",
        name: "Pool Session",
        activityType: "swim",
        startLat: 35.2271,
        startLng: -80.8431,
        totalDistance: 80,
      }),
    ).toEqual({
      valid: false,
      errors: [
        "Activity category 'swim' does not support routes in Wahoo. Only bike and run support routes.",
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
        startLat: 35.2271,
        startLng: -80.8431,
        totalDistance: 500001,
      }),
    ).toEqual({
      valid: true,
      errors: [],
      warnings: ["Route is very long (more than 500km)"],
    });
  });

  it.each([
    { startLat: 90, startLng: 180, valid: true },
    { startLat: -90, startLng: -180, valid: true },
    { startLat: 90.0001, startLng: 0, valid: false },
    { startLat: 0, startLng: 180.0001, valid: false },
    { startLat: Number.NaN, startLng: 0, valid: false },
    { startLng: 0, valid: false },
  ])("validates route start coordinate bounds for $startLat, $startLng", (coordinates) => {
    expect(hasValidRouteStartCoordinates(coordinates)).toBe(coordinates.valid);
  });

  it("rejects a supported route when its start coordinates are out of range", () => {
    expect(
      validateRouteForWahoo({
        filePath: "routes/invalid.gpx",
        name: "Invalid Route",
        activityType: "run",
        startLat: 91,
        startLng: -80.8431,
        totalDistance: 1000,
      }),
    ).toMatchObject({
      valid: false,
      errors: ["Route start coordinates must be within valid latitude and longitude bounds."],
    });
  });

  it.each([
    { category: "bike" as const, expected: 0 },
    { category: "run" as const, expected: 1 },
    { category: "swim" as const, expected: 0 },
  ])("maps $category routes to Wahoo activity family $expected", ({ category, expected }) => {
    expect(getWorkoutTypeFamilyForRoute(category)).toBe(expected);
  });
});
