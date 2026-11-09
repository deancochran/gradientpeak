import { Encoder, Profile } from "@garmin/fitsdk";

const FIT_MANUFACTURER_DEVELOPMENT = "development";
const FIT_FILE_TYPE_COURSE = "course";
const FIT_ROUTE_EPOCH_MS = Date.parse("2000-01-01T00:00:00.000Z");

type RouteCourseCoordinate = {
  altitude?: number;
  latitude: number;
  longitude: number;
};

export type RouteCourseFitEncodingResult =
  | { bytes: Uint8Array; ok: true }
  | { error: "encoding_failed" | "invalid_coordinates" | "too_few_coordinates"; ok: false };

function degreesToSemicircles(value: number): number {
  return Math.round(value * (2 ** 31 / 180));
}

function distanceMeters(from: RouteCourseCoordinate, to: RouteCourseCoordinate): number {
  const radius = 6_371_000;
  const latitudeDelta = ((to.latitude - from.latitude) * Math.PI) / 180;
  const longitudeDelta = ((to.longitude - from.longitude) * Math.PI) / 180;
  const fromLatitude = (from.latitude * Math.PI) / 180;
  const toLatitude = (to.latitude * Math.PI) / 180;
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isValidCoordinate(coordinate: RouteCourseCoordinate): boolean {
  return (
    Number.isFinite(coordinate.latitude) &&
    coordinate.latitude >= -90 &&
    coordinate.latitude <= 90 &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.longitude >= -180 &&
    coordinate.longitude <= 180 &&
    (coordinate.altitude === undefined || Number.isFinite(coordinate.altitude))
  );
}

/** Encodes provider-neutral route geometry as a FIT course file. */
export function encodeRouteCourseFit(input: {
  coordinates: RouteCourseCoordinate[];
  name: string;
}): RouteCourseFitEncodingResult {
  if (input.coordinates.length < 2) return { error: "too_few_coordinates", ok: false };
  if (!input.coordinates.every(isValidCoordinate)) {
    return { error: "invalid_coordinates", ok: false };
  }

  try {
    const encoder = new Encoder();
    encoder.writeMesg({
      manufacturer: FIT_MANUFACTURER_DEVELOPMENT,
      mesgNum: Profile.MesgNum.FILE_ID,
      product: 1,
      timeCreated: new Date(FIT_ROUTE_EPOCH_MS),
      type: FIT_FILE_TYPE_COURSE,
    });
    encoder.writeMesg({
      mesgNum: Profile.MesgNum.COURSE,
      name: input.name,
      sport: "generic",
    });

    let cumulativeDistance = 0;
    input.coordinates.forEach((coordinate, index) => {
      if (index > 0) {
        const previous = input.coordinates[index - 1];
        if (previous) cumulativeDistance += distanceMeters(previous, coordinate);
      }
      encoder.writeMesg({
        ...(coordinate.altitude === undefined ? {} : { altitude: coordinate.altitude }),
        distance: cumulativeDistance,
        mesgNum: Profile.MesgNum.RECORD,
        positionLat: degreesToSemicircles(coordinate.latitude),
        positionLong: degreesToSemicircles(coordinate.longitude),
        timestamp: new Date(FIT_ROUTE_EPOCH_MS + index * 1000),
      });
    });

    return { bytes: encoder.close(), ok: true };
  } catch {
    return { error: "encoding_failed", ok: false };
  }
}
