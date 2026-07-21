import { createHash } from "node:crypto";
import type { Page, TestInfo } from "@playwright/test";

// Generated deterministically with @garmin/fitsdk 21.188.0 from the repository's
// official-SDK swim fixture (2026-01-01T10:00:00Z, 25 m pool, one active length).
const SWIM_FIT_BASE64 =
  // biome-ignore lint/security/noSecrets: deterministic binary FIT fixture, not a credential
  "DgLEUoQBAAAuRklUhCRAAAAAAAUAAQIBAoQCAoQEBIYDBIwABP8AAQCg+bhDewAAAEEAABUAA/0EhgABAgEBAgGg+bhDAABCAAAUAAP9BIYFBIYDAQICoPm4QwAAAAB4Ar35uEPECQAAgkMAAGUAC/4ChP0EhgIEhgMEhgQEhgUChAYChAwBAgcBAgABAgEBAgMAAL75uEOg+bhDMHUAADB1AAAUAEEDAQAcAUQAABMADv4ChP0EhgIEhgcEhggEhgkEhgABAgEBAhkBAicBAiMChCAChCgChCYBAgQAAL75uEOg+bhDMHUAADB1AADECQAACQEFEQAAAQABAABFAAASABL+AoT9BIYCBIYHBIYIBIY7BIYJBIYFAQIGAQIZAoQaAoQAAQIBAQIcAQIsAoQuAQIhAoQvAoQFAAC++bhDoPm4QzB1AAAwdQAAMHUAAMQJAAAFEQAAAQAIAQDECQABAAEAAb75uEMABEYAACIABv0EhgAEhgEChAIBAgMBAgQBAga++bhDMHUAAAEAABoBhPU=";

export const activityFiles = {
  fit: {
    name: "deterministic-pool-swim.fit",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(SWIM_FIT_BASE64, "base64"),
  },
  gpx: {
    name: "deterministic-run.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(`<?xml version="1.0"?><gpx><trk><name>Deterministic Run</name><trkseg>
      <trkpt lat="40.1000" lon="-74.1000"><ele>10</ele><time>2026-01-01T10:00:00Z</time><extensions><gpxtpx:hr>145</gpxtpx:hr><power>210</power></extensions></trkpt>
      <trkpt lat="40.1010" lon="-74.1010"><ele>14</ele><time>2026-01-01T10:05:00Z</time><extensions><gpxtpx:hr>152</gpxtpx:hr><power>225</power></extensions></trkpt>
      <trkpt lat="40.1020" lon="-74.1020"><ele>12</ele><time>2026-01-01T10:10:00Z</time><extensions><gpxtpx:hr>158</gpxtpx:hr><power>240</power></extensions></trkpt>
    </trkseg></trk></gpx>`),
  },
  tcx: {
    name: "deterministic-ride.tcx",
    mimeType: "application/vnd.garmin.tcx+xml",
    buffer:
      Buffer.from(`<TrainingCenterDatabase><Activities><Activity Sport="Biking"><Id>Deterministic Ride</Id><Lap><Calories>500</Calories><Track>
      <Trackpoint><Time>2026-01-02T10:00:00Z</Time><Position><LatitudeDegrees>40.1</LatitudeDegrees><LongitudeDegrees>-74.1</LongitudeDegrees></Position><DistanceMeters>0</DistanceMeters><HeartRateBpm><Value>140</Value></HeartRateBpm><Cadence>80</Cadence><Extensions><TPX><Watts>210</Watts></TPX></Extensions></Trackpoint>
      <Trackpoint><Time>2026-01-02T10:15:00Z</Time><Position><LatitudeDegrees>40.15</LatitudeDegrees><LongitudeDegrees>-74.15</LongitudeDegrees></Position><DistanceMeters>6000</DistanceMeters><HeartRateBpm><Value>150</Value></HeartRateBpm><Cadence>85</Cadence><Extensions><TPX><Watts>230</Watts></TPX></Extensions></Trackpoint>
      <Trackpoint><Time>2026-01-02T10:30:00Z</Time><Position><LatitudeDegrees>40.2</LatitudeDegrees><LongitudeDegrees>-74.2</LongitudeDegrees></Position><DistanceMeters>12000</DistanceMeters><HeartRateBpm><Value>160</Value></HeartRateBpm><Cadence>90</Cadence><Extensions><TPX><Watts>250</Watts></TPX></Extensions></Trackpoint>
    </Track></Lap></Activity></Activities></TrainingCenterDatabase>`),
  },
} as const;

export async function importActivity(
  page: Page,
  fixture: (typeof activityFiles)[keyof typeof activityFiles],
  name: string,
) {
  await page.goto("/activities/import");
  await page.getByTestId("activity-import-file-input").setInputFiles(fixture);
  await page.getByTestId("activity-import-name-input").fill(name);
  await page.getByRole("button", { name: "Import activity" }).click();
  await page.waitForURL(/\/activities\/[0-9a-f-]+\/?$/);
  return page.url().match(/\/activities\/([0-9a-f-]+)/)?.[1] ?? "";
}

export function activityFixtureIdentity(testInfo: TestInfo, label: string) {
  const provenance = [
    testInfo.project.name,
    ...testInfo.titlePath,
    `repeat-${testInfo.repeatEachIndex}`,
    `retry-${testInfo.retry}`,
  ].join("|");
  const digest = createHash("sha256").update(provenance).digest("hex").slice(0, 12);
  return `Parity ${label} ${digest}`;
}

export async function deleteImportedActivity(page: Page, activityId: string) {
  if (!activityId) return;
  await page.goto(`/activities/${activityId}`);
  const deleteButton = page.getByRole("button", { name: "Delete", exact: true });
  if ((await deleteButton.count()) === 0) return;
  await deleteButton.click();
  await page.getByRole("button", { name: "Delete activity", exact: true }).click();
  await page.waitForURL(/\/activities\/?$/);
}
