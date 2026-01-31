import { calculateBestEffort } from "./best-efforts";

/**
 * Lactate Threshold Heart Rate (LTHR) Detection
 *
 * Detects LTHR based on sustained high-intensity efforts.
 *
 * Algorithm:
 * 1. Find the best 20-minute average heart rate.
 * 2. Estimate LTHR as 95% of the 20-minute max average heart rate.
 * 3. Alternatively, if a 30-minute effort is available, use the average HR of the last 20 minutes.
 *    (For simplicity, we'll stick to the 95% of 20-minute max rule for now).
 */

/**
 * Detects LTHR from a heart rate stream.
 *
 * @param hrStream - Array of heart rate values (bpm).
 * @param timestamps - Array of timestamps (seconds).
 * @returns Detected LTHR (bpm) or null if insufficient data.
 */
export function detectLTHR(
  hrStream: number[],
  timestamps: number[],
): number | null {
  if (!hrStream || !timestamps || hrStream.length === 0) {
    return null;
  }

  // Check if we have at least 20 minutes of data
  const totalDuration = timestamps[timestamps.length - 1]! - timestamps[0]!;
  if (totalDuration < 1200) {
    // 20 minutes = 1200 seconds
    return null;
  }

  // Calculate best 20-minute effort
  const best20MinEffort = calculateBestEffort(hrStream, timestamps, 1200);

  if (!best20MinEffort) {
    return null;
  }

  // Estimate LTHR as 95% of the 20-minute max average HR
  // This is a standard field test estimation (Joe Friel).
  const estimatedLTHR = best20MinEffort.value * 0.95;

  return Math.round(estimatedLTHR);
}

/**
 * Detects FTP (Functional Threshold Power) from a power stream.
 *
 * @param powerStream - Array of power values (watts).
 * @param timestamps - Array of timestamps (seconds).
 * @returns Detected FTP (watts) or null if insufficient data.
 */
export function detectFTP(
  powerStream: number[],
  timestamps: number[],
): number | null {
  if (!powerStream || !timestamps || powerStream.length === 0) {
    return null;
  }

  // Check if we have at least 20 minutes of data
  const totalDuration = timestamps[timestamps.length - 1]! - timestamps[0]!;
  if (totalDuration < 1200) {
    // 20 minutes
    return null;
  }

  // Calculate best 20-minute effort
  const best20MinEffort = calculateBestEffort(powerStream, timestamps, 1200);

  if (!best20MinEffort) {
    return null;
  }

  // Estimate FTP as 95% of the 20-minute max average power
  // Standard FTP test protocol.
  const estimatedFTP = best20MinEffort.value * 0.95;

  return Math.round(estimatedFTP);
}
