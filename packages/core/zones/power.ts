import type { AggregatedStream } from "../calculations";

export function getPowerZoneIndexFromFtpPercent(ftpPercent: number): number {
  if (ftpPercent < 55) return 0;
  if (ftpPercent < 76) return 1;
  if (ftpPercent < 91) return 2;
  if (ftpPercent < 106) return 3;
  if (ftpPercent < 121) return 4;
  if (ftpPercent < 151) return 5;
  return 6;
}

export function estimatePowerZoneDistribution(duration: number, avgIF: number): number[] {
  const zones = [0, 0, 0, 0, 0, 0, 0];
  const avgFTPPercent = avgIF * 100;

  if (avgFTPPercent < 55) {
    zones[0] = duration * 0.8;
    zones[1] = duration * 0.2;
  } else if (avgFTPPercent < 75) {
    zones[0] = duration * 0.2;
    zones[1] = duration * 0.6;
    zones[2] = duration * 0.2;
  } else if (avgFTPPercent < 90) {
    zones[1] = duration * 0.3;
    zones[2] = duration * 0.5;
    zones[3] = duration * 0.2;
  } else if (avgFTPPercent < 105) {
    zones[2] = duration * 0.2;
    zones[3] = duration * 0.6;
    zones[4] = duration * 0.2;
  } else {
    zones[3] = duration * 0.2;
    zones[4] = duration * 0.5;
    zones[5] = duration * 0.3;
  }

  return zones.map(Math.round);
}

export function calculatePowerZoneDistribution(
  powerStream?: AggregatedStream,
  ftp?: number | null,
): Record<string, number | undefined> {
  if (!powerStream?.values || !ftp) {
    return {
      zone1: undefined,
      zone2: undefined,
      zone3: undefined,
      zone4: undefined,
      zone5: undefined,
      zone6: undefined,
      zone7: undefined,
    };
  }

  const powers = powerStream.values as number[];
  const timestamps = powerStream.timestamps;
  const zones = {
    zone1: 0,
    zone2: 0,
    zone3: 0,
    zone4: 0,
    zone5: 0,
    zone6: 0,
    zone7: 0,
  };

  for (let index = 0; index < powers.length; index += 1) {
    const pct = (powers[index]! / ftp) * 100;
    const timeInZone =
      index < timestamps.length - 1
        ? timestamps[index + 1]! - timestamps[index]!
        : index > 0
          ? timestamps[index]! - timestamps[index - 1]!
          : 1;
    const zoneIndex = getPowerZoneIndexFromFtpPercent(pct);
    zones[`zone${zoneIndex + 1}` as keyof typeof zones] += timeInZone;
  }

  return Object.fromEntries(Object.entries(zones).map(([key, value]) => [key, Math.round(value)]));
}
