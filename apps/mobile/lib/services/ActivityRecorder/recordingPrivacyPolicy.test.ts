import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const mobileRoot = path.resolve(import.meta.dirname, "../../..");

async function source(relativePath: string) {
  return readFile(path.join(mobileRoot, relativePath), "utf8");
}

describe("in-app recording privacy policy", () => {
  it("has no native location task or recorder location effect entry point", async () => {
    const [layout, recorder, routeController, activityScreen, quickEdit] = await Promise.all([
      source("app/_layout.tsx"),
      source("lib/services/ActivityRecorder/index.ts"),
      source("lib/services/ActivityRecorder/routeController.ts"),
      source("app/(internal)/record/activity.tsx"),
      source("components/recording/RecordingActivityQuickEdit.tsx"),
    ]);

    expect(layout).not.toMatch(/LocationManager|TaskManager|background location/i);
    expect(recorder).not.toMatch(
      /LocationManager|watchPositionAsync|startLocationUpdatesAsync|appendHeadlessGpsLocations|ingestLocationData/,
    );
    expect(routeController).not.toMatch(/updateRouteProgress|projectLocationOntoRoute/);
    expect(activityScreen).not.toMatch(/record-gps-option|GPS Recording|GPS On|GPS Off/);
    expect(quickEdit).not.toMatch(/gps-on-option|gps-off-option|GPS recording/);
  });
});
