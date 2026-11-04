import { z } from "zod";
import { MAX_ROUTE_POINT_COUNT } from "../route-files";
import { calculateDistance } from "../utils/polyline";
import { SIMULATION_EXECUTION, simulationExecutionSchema } from "./execution-evidence";

export const simulationRouteCoordinateSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    altitude: z.number().finite().nullable().optional(),
  })
  .strict();
export const simulationRouteIndexSchema = z
  .object({
    execution: simulationExecutionSchema,
    points: z
      .array(
        z
          .object({
            latitude: z.number(),
            longitude: z.number(),
            elevationMeters: z.number().nullable(),
            distanceMeters: z.number().nonnegative(),
          })
          .strict(),
      )
      .max(MAX_ROUTE_POINT_COUNT),
    totalDistanceMeters: z.number().finite().nonnegative(),
    duplicatesRemoved: z.number().int().nonnegative(),
  })
  .strict();
export type SimulationRouteIndex = z.infer<typeof simulationRouteIndexSchema>;
const EARTH_RADIUS_METERS = 6_371_000;
const radians = (value: number) => (value * Math.PI) / 180;
const degrees = (value: number) => (value * 180) / Math.PI;
const finiteOrUnknown = (value: number) => (Number.isFinite(value) ? value : null);

/** Full canonical geometry only. Last duplicate point wins (including missing
 * elevation), so absent heights never become a flat road or forward-filled height. */
export function indexSimulationRoute(input: unknown): SimulationRouteIndex {
  const coordinates = z
    .array(simulationRouteCoordinateSchema)
    .max(MAX_ROUTE_POINT_COUNT)
    .parse(input);
  const points: SimulationRouteIndex["points"] = [];
  let distance = 0;
  let duplicatesRemoved = 0;
  for (const coordinate of coordinates) {
    const previous = points.at(-1);
    const length = previous ? calculateDistance(previous, coordinate) : 0;
    if (!Number.isFinite(length)) throw new Error("Route distance could not be calculated.");
    if (length / EARTH_RADIUS_METERS > Math.PI - 0.000001)
      throw new Error("An antipodal route edge needs intermediate geometry.");
    const point = {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      elevationMeters: coordinate.altitude ?? null,
      distanceMeters: distance + length,
    };
    if (previous && length < 0.000001) {
      points[points.length - 1] = { ...point, distanceMeters: distance };
      duplicatesRemoved++;
    } else {
      distance += length;
      points.push(point);
    }
  }
  return {
    execution: SIMULATION_EXECUTION,
    points,
    totalDistanceMeters: distance,
    duplicatesRemoved,
  };
}

export function simulationPositionAt(index: SimulationRouteIndex, requestedMeters: number) {
  if (!Number.isFinite(requestedMeters)) throw new Error("Virtual route distance must be finite.");
  const distanceMeters = Math.max(0, Math.min(index.totalDistanceMeters, requestedMeters));
  const first = index.points[0];
  const last = index.points.at(-1);
  if (!first || !last || index.totalDistanceMeters <= 0) return null;
  if (distanceMeters === index.totalDistanceMeters)
    return {
      execution: SIMULATION_EXECUTION,
      latitude: last.latitude,
      longitude: last.longitude,
      elevationMeters: last.elevationMeters,
      gradePercent: null,
      distanceMeters,
      routeEnded: true,
    };
  let low = 0;
  let high = index.points.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if ((index.points[middle]?.distanceMeters ?? Infinity) <= distanceMeters) low = middle;
    else high = middle;
  }
  const from = index.points[low];
  const to = index.points[low + 1];
  if (!from || !to) return null;
  const length = to.distanceMeters - from.distanceMeters;
  const ratio = Math.max(0, Math.min(1, (distanceMeters - from.distanceMeters) / length));
  const angle = length / EARTH_RADIUS_METERS;
  const a = Math.sin((1 - ratio) * angle) / Math.sin(angle);
  const b = Math.sin(ratio * angle) / Math.sin(angle);
  const x =
    a * Math.cos(radians(from.latitude)) * Math.cos(radians(from.longitude)) +
    b * Math.cos(radians(to.latitude)) * Math.cos(radians(to.longitude));
  const y =
    a * Math.cos(radians(from.latitude)) * Math.sin(radians(from.longitude)) +
    b * Math.cos(radians(to.latitude)) * Math.sin(radians(to.longitude));
  const zAxis = a * Math.sin(radians(from.latitude)) + b * Math.sin(radians(to.latitude));
  const knownHeights = from.elevationMeters !== null && to.elevationMeters !== null;
  const elevationMeters =
    ratio === 0
      ? from.elevationMeters
      : knownHeights
        ? finiteOrUnknown(
            (from.elevationMeters ?? 0) * (1 - ratio) + (to.elevationMeters ?? 0) * ratio,
          )
        : null;
  const gradePercent = knownHeights
    ? finiteOrUnknown((((to.elevationMeters ?? 0) - (from.elevationMeters ?? 0)) / length) * 100)
    : null;
  return {
    execution: SIMULATION_EXECUTION,
    latitude: ratio === 0 ? from.latitude : degrees(Math.atan2(zAxis, Math.hypot(x, y))),
    longitude: ratio === 0 ? from.longitude : degrees(Math.atan2(y, x)),
    elevationMeters,
    gradePercent,
    distanceMeters,
    routeEnded: false,
  };
}
