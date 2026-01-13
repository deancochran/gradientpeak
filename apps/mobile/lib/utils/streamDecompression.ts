import pako from "pako";

export interface DecompressedStream {
  type: string;
  dataType: "float" | "latlng" | "boolean";
  values: number[] | [number, number][] | boolean[];
  timestamps: number[];
  sampleCount: number;
}

/**
 * Convert base64 string to Uint8Array (React Native compatible)
 * Uses atob() for base64 decoding
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decompress a single activity stream
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
  try {
    // Decompress values
    const valuesBytes = base64ToUint8Array(compressedValues);
    const decompressedValues = pako.ungzip(valuesBytes);

    // Decompress timestamps
    const timestampsBytes = base64ToUint8Array(compressedTimestamps);
    const decompressedTimestamps = pako.ungzip(timestampsBytes);

    // Parse based on data type
    let values: number[] | [number, number][] | boolean[];
    if (dataType === "latlng") {
      // Parse as JSON array of coordinate pairs
      const jsonStr = new TextDecoder().decode(decompressedValues);
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
 * Decompress all activity streams
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
