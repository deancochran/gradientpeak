/**
 * Calculates Normalized Power (NP) using 30-second rolling average.
 *
 * NP is the power you could have maintained for the same physiological "cost"
 * if your power had been perfectly constant.
 *
 * Algorithm:
 * 1. Calculate 30-second rolling average of power.
 * 2. Raise each rolling average to the 4th power.
 * 3. Average the 4th power values.
 * 4. Take the 4th root of the average.
 *
 * @param powerStream - Array of power values (watts)
 * @returns Normalized Power (watts)
 */
export function calculateNormalizedPower(powerStream: number[]): number {
  if (!powerStream || powerStream.length === 0) return 0;

  const WINDOW_SIZE = 30; // 30-second rolling average
  const rollingAverages: number[] = [];

  // Calculate 30-second rolling averages
  for (let i = 0; i < powerStream.length; i++) {
    // For the first 29 seconds, we use the available data (expanding window)
    // or we could start from index 29. Standard practice varies, but
    // using available data for the start is common to avoid dropping data.
    const start = Math.max(0, i - WINDOW_SIZE + 1);
    const window = powerStream.slice(start, i + 1);

    if (window.length === 0) continue;

    const avg = window.reduce((sum, p) => sum + p, 0) / window.length;
    rollingAverages.push(avg);
  }

  if (rollingAverages.length === 0) return 0;

  // Raise each rolling average to the 4th power
  const raisedTo4th = rollingAverages.map((avg) => Math.pow(avg, 4));

  // Average the 4th power values
  const avgOf4th =
    raisedTo4th.reduce((sum, val) => sum + val, 0) / raisedTo4th.length;

  // Take the 4th root
  const normalizedPower = Math.pow(avgOf4th, 1 / 4);

  return Math.round(normalizedPower);
}
