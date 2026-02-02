/**
 * Weather utilities for fetching environmental data for activities.
 */

/**
 * Fetch the temperature for a specific location and time.
 * Uses Open-Meteo API (free, no key required).
 *
 * @param latitude Latitude of the location
 * @param longitude Longitude of the location
 * @param timestamp Date and time of the activity
 * @returns Temperature in Celsius, or null if fetch fails
 */
export async function fetchActivityTemperature(
  latitude: number,
  longitude: number,
  timestamp: Date,
): Promise<number | null> {
  try {
    const dateStr = timestamp.toISOString().split("T")[0];
    const now = new Date();
    const isHistorical =
      now.getTime() - timestamp.getTime() > 7 * 24 * 60 * 60 * 1000; // Older than 7 days

    // Choose API endpoint based on age of activity
    // Archive API for historical data, Forecast API for recent/current data
    const baseUrl = isHistorical
      ? "https://archive-api.open-meteo.com/v1/archive"
      : "https://api.open-meteo.com/v1/forecast";

    const url = `${baseUrl}?latitude=${latitude}&longitude=${longitude}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m`;

    const response = await fetch(url);

    if (!response.ok) {
      console.warn(
        `Weather API error: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const data = (await response.json()) as {
      hourly?: {
        time: string[];
        temperature_2m: (number | null)[];
      };
    };

    if (
      !data.hourly ||
      !data.hourly.temperature_2m ||
      !data.hourly.time ||
      data.hourly.time.length === 0
    ) {
      return null;
    }

    // Find the closest hour to the activity timestamp
    // Open-Meteo returns times in ISO 8601 format (e.g., "2023-10-27T00:00")
    // Note: Open-Meteo defaults to UTC if timezone is not specified, which matches our ISO timestamp usage
    const activityTime = timestamp.getTime();
    let closestTemp: number | null = null;
    let minDiff = Infinity;

    for (let i = 0; i < data.hourly.time.length; i++) {
      const timeStr = data.hourly.time[i];
      if (!timeStr) continue;

      // Append 'Z' to treat as UTC if not present, though Open-Meteo usually returns local time if timezone provided
      // Here we didn't provide timezone, so it defaults to GMT (UTC)
      const time = new Date(
        timeStr + (timeStr.endsWith("Z") ? "" : "Z"),
      ).getTime();
      const diff = Math.abs(time - activityTime);

      if (diff < minDiff) {
        minDiff = diff;
        const temp = data.hourly.temperature_2m[i];
        if (temp !== undefined) {
          closestTemp = temp;
        }
      }
    }

    return closestTemp;
  } catch (error) {
    console.error("Error fetching weather data:", error);
    return null;
  }
}
