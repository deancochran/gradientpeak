import { gunzipSync } from "node:zlib";
import { Buffer } from "node:buffer";

/**
 * Server-side stream decompression utilities for activity streams.
 *
 * Supports gzip-compressed float32, latlng, and boolean streams.
 * Uses Node.js built-in zlib for decompression.
 *
 * IMPORTANT: This file contains SERVER-ONLY implementations that use Node.js built-ins.
 * These functions will throw errors if called in React Native.
 * Mobile app has its own implementation in: apps/mobile/lib/utils/streamDecompression.ts
 *
 * For server-side usage (Next.js, tRPC), import the actual implementations from the tRPC package.
 */

export interface DecompressedStream {
  type: string;
  dataType: "float" | "latlng" | "boolean";
  values: number[] | [number, number][] | boolean[];
  timestamps: number[];
  sampleCount: number;
}

/**
 * Convert base64 string to Buffer (Node.js server-side)
 */
export function base64ToBuffer(base64: string): any {
  if (!Buffer) {
    throw new Error(
      "Buffer is not available in this environment. Use server-side only.",
    );
  }
  return Buffer.from(base64, "base64");
}

/**
 * Decompress a single activity stream (server-side)
 *
 * @param compressedValues - Base64 encoded gzipped stream values
 * @param compressedTimestamps - Base64 encoded gzipped timestamps
 * @param dataType - Type of data (float, latlng, boolean)
 * @param streamType - Stream identifier (e.g., 'heartrate', 'power')
 * @returns Decompressed stream with values and timestamps
 */
export function decompressStream(
  compressedValues: string,
  compressedTimestamps: string,
  dataType: "float" | "latlng" | "boolean",
  streamType: string,
): DecompressedStream {
  if (!gunzipSync) {
    throw new Error(
      "gunzipSync is not available in this environment. Use server-side only.",
    );
  }

  try {
    // Decompress values
    const valuesBuffer = base64ToBuffer(compressedValues);
    const decompressedValues = gunzipSync(valuesBuffer);

    // Decompress timestamps
    const timestampsBuffer = base64ToBuffer(compressedTimestamps);
    const decompressedTimestamps = gunzipSync(timestampsBuffer);

    // Parse based on data type
    let values: number[] | [number, number][] | boolean[];
    if (dataType === "latlng") {
      // Parse as JSON array of coordinate pairs
      const jsonStr = decompressedValues.toString("utf-8");
      values = JSON.parse(jsonStr) as [number, number][];
    } else {
      // Parse as Float32Array for numeric data
      const float32Array = new Float32Array(
        decompressedValues.buffer,
        decompressedValues.byteOffset,
        decompressedValues.byteLength / 4,
      );
      const numericValues = Array.from(float32Array);

      if (dataType === "boolean") {
        // Convert float to boolean (> 0.5 = true)
        values = numericValues.map((v) => v > 0.5);
      } else {
        values = numericValues;
      }
    }

    // Parse timestamps as Float32Array
    const timestampsArray = new Float32Array(
      decompressedTimestamps.buffer,
      decompressedTimestamps.byteOffset,
      decompressedTimestamps.byteLength / 4,
    );
    const timestamps = Array.from(timestampsArray);

    return {
      type: streamType,
      dataType,
      values,
      timestamps,
      sampleCount: values.length,
    };
  } catch (error) {
    console.error(`Failed to decompress ${streamType} stream:`, error);
    throw error;
  }
}

/**
 * Decompress all activity streams (server-side)
 *
 * @param activityStreams - Array of compressed stream objects from database
 * @returns Map of stream type to decompressed stream data
 */
export function decompressAllStreams(
  activityStreams: Array<{
    type: string;
    data_type: "float" | "latlng" | "boolean";
    compressed_values: string;
    compressed_timestamps: string;
  }>,
): Map<string, DecompressedStream> {
  const streams = new Map<string, DecompressedStream>();

  for (const stream of activityStreams) {
    try {
      const decompressed = decompressStream(
        stream.compressed_values,
        stream.compressed_timestamps,
        stream.data_type,
        stream.type,
      );
      streams.set(stream.type, decompressed);
    } catch (error) {
      // Log error but continue with other streams
      console.error(`Skipping ${stream.type} stream due to error:`, error);
    }
  }

  return streams;
}

/**
 * Extract numeric stream values from decompressed stream
 * Returns undefined if stream doesn't exist or isn't numeric
 */
export function extractNumericStream(
  streams: Map<string, DecompressedStream>,
  streamType: string,
): number[] | undefined {
  const stream = streams.get(streamType);
  if (!stream || stream.dataType === "latlng") {
    return undefined;
  }

  if (stream.dataType === "boolean") {
    // Convert boolean to 0/1
    return (stream.values as boolean[]).map((v) => (v ? 1 : 0));
  }

  return stream.values as number[];
}

/**
 * Calculate age from date of birth
 */
export function calculateAge(dob: string | null): number | null {
  if (!dob) return null;

  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }

  return age;
}
