import { Decoder, Stream } from "@garmin/fitsdk";
import { describe, expect, it } from "vitest";
import { encodeRouteCourseFit } from "./route-course-fit";

describe("encodeRouteCourseFit", () => {
  it("round-trips a deterministic FIT course with route geometry", () => {
    const result = encodeRouteCourseFit({
      coordinates: [
        { altitude: 100, latitude: 35, longitude: -85 },
        { altitude: 105, latitude: 35.001, longitude: -85.001 },
        { altitude: 103, latitude: 35.002, longitude: -85.002 },
      ],
      name: "Morning Ridge",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected FIT course encoding to succeed");

    const stream = Stream.fromByteArray(result.bytes);
    expect(Decoder.isFIT(stream)).toBe(true);
    const decoder = new Decoder(Stream.fromByteArray(result.bytes));
    expect(decoder.checkIntegrity()).toBe(true);
    const decoded = decoder.read();
    expect(decoded.errors).toEqual([]);
    expect(decoded.messages.fileIdMesgs).toEqual([
      expect.objectContaining({ manufacturer: "development", type: "course" }),
    ]);
    expect(decoded.messages.courseMesgs).toEqual([
      expect.objectContaining({ name: "Morning Ridge", sport: "generic" }),
    ]);
    expect(decoded.messages.recordMesgs).toHaveLength(3);
    expect(decoded.messages.recordMesgs?.[2]).toEqual(
      expect.objectContaining({ altitude: 103, distance: expect.any(Number) }),
    );
  });

  it("rejects invalid or incomplete geometry before encoding", () => {
    expect(
      encodeRouteCourseFit({ coordinates: [{ latitude: 35, longitude: -85 }], name: "Short" }),
    ).toEqual({ error: "too_few_coordinates", ok: false });
    expect(
      encodeRouteCourseFit({
        coordinates: [
          { latitude: 95, longitude: -85 },
          { latitude: 35, longitude: -85 },
        ],
        name: "Invalid",
      }),
    ).toEqual({ error: "invalid_coordinates", ok: false });
  });
});
