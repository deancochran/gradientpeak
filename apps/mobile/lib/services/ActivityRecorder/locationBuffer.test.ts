import { describe, expect, it } from "vitest";
import {
  LOCATION_BUFFER_MAX_AGE_MS,
  parseFreshLocationBuffer,
  serializeLocationBuffer,
} from "./locationBuffer";

const location = {
  coords: {
    accuracy: 5,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    latitude: 40,
    longitude: -75,
    speed: null,
  },
  timestamp: 1000,
};

describe("locationBuffer", () => {
  it("round-trips fresh location buffers", () => {
    const raw = serializeLocationBuffer([location], 10_000);

    expect(parseFreshLocationBuffer(raw, 10_001)).toEqual({
      isStale: false,
      locations: [location],
    });
  });

  it("expires stale and legacy location buffers", () => {
    expect(
      parseFreshLocationBuffer(
        serializeLocationBuffer([location], 10_000),
        10_000 + LOCATION_BUFFER_MAX_AGE_MS + 1,
      ),
    ).toEqual({ isStale: true, locations: [] });
    expect(parseFreshLocationBuffer(JSON.stringify([location]), 10_000)).toEqual({
      isStale: true,
      locations: [],
    });
  });
});
