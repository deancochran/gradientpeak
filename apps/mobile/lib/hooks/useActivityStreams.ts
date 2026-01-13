import { useCallback, useMemo } from "react";
import {
  decompressAllStreams,
  type DecompressedStream,
} from "@/lib/utils/streamDecompression";

/**
 * Custom hook to decompress and memoize activity streams
 * Provides convenient helper methods for checking stream availability
 *
 * @param activityStreams - Array of compressed stream objects from database
 * @returns Object with decompressed streams and helper methods
 */
export function useActivityStreams(activityStreams?: any[]) {
  const streams = useMemo(() => {
    if (!activityStreams || activityStreams.length === 0) {
      return new Map<string, DecompressedStream>();
    }
    return decompressAllStreams(activityStreams);
  }, [activityStreams]);

  // Memoize boolean checks
  const hasGPS = useMemo(() => streams.has("latlng"), [streams]);
  const hasHeartRate = useMemo(() => streams.has("heartrate"), [streams]);
  const hasPower = useMemo(() => streams.has("power"), [streams]);
  const hasSpeed = useMemo(() => streams.has("speed"), [streams]);
  const hasElevation = useMemo(
    () => streams.has("altitude") || streams.has("elevation"),
    [streams],
  );
  const hasCadence = useMemo(() => streams.has("cadence"), [streams]);
  const hasTemperature = useMemo(() => streams.has("temperature"), [streams]);
  const hasGradient = useMemo(() => streams.has("gradient"), [streams]);

  // Memoize GPS coordinates with timestamps
  const gpsCoordinatesWithTimestamps = useMemo(() => {
    const latlngStream = streams.get("latlng");
    if (!latlngStream || latlngStream.dataType !== "latlng") {
      return { coordinates: [], timestamps: [] };
    }
    const coordinates = (latlngStream.values as [number, number][]).map(
      ([lat, lng]) => ({
        latitude: lat,
        longitude: lng,
      }),
    );
    return {
      coordinates,
      timestamps: latlngStream.timestamps,
    };
  }, [streams]);

  const gpsCoordinates = useMemo(
    () => gpsCoordinatesWithTimestamps.coordinates,
    [gpsCoordinatesWithTimestamps],
  );

  // Memoize elevation stream
  const elevationStream = useMemo(
    () => streams.get("altitude") || streams.get("elevation"),
    [streams],
  );

  // Stable callback functions
  const hasStream = useCallback((type: string) => streams.has(type), [streams]);
  const getStream = useCallback((type: string) => streams.get(type), [streams]);
  const getGPSCoordinates = useCallback(() => gpsCoordinates, [gpsCoordinates]);
  const getGPSCoordinatesWithTimestamps = useCallback(
    () => gpsCoordinatesWithTimestamps,
    [gpsCoordinatesWithTimestamps],
  );
  const getElevationStream = useCallback(
    () => elevationStream,
    [elevationStream],
  );

  return {
    /**
     * Map of all decompressed streams (key: stream type, value: stream data)
     */
    streams,

    /**
     * Check if a specific stream type is available
     */
    hasStream,

    /**
     * Get a specific stream by type
     */
    getStream,

    /**
     * Check if GPS data is available
     */
    hasGPS,

    /**
     * Check if heart rate data is available
     */
    hasHeartRate,

    /**
     * Check if power data is available
     */
    hasPower,

    /**
     * Check if speed data is available
     */
    hasSpeed,

    /**
     * Check if elevation data is available
     */
    hasElevation,

    /**
     * Check if cadence data is available
     */
    hasCadence,

    /**
     * Check if temperature data is available
     */
    hasTemperature,

    /**
     * Check if gradient data is available
     */
    hasGradient,

    /**
     * Get GPS coordinates as array of {latitude, longitude} objects
     * Suitable for use with react-native-maps
     */
    getGPSCoordinates,

    /**
     * Get GPS coordinates with their corresponding timestamps
     * Returns {coordinates: [], timestamps: []}
     */
    getGPSCoordinatesWithTimestamps,

    /**
     * Get elevation stream (altitude or elevation)
     */
    getElevationStream,

    /**
     * Count of available streams
     */
    streamCount: streams.size,
  };
}
