// @vitest-environment node
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CoachAthleteZonesSection } from "./coach-athlete-zones-section";

const identity = {
  actorId: "actor-private",
  organizationId: "org-private",
  athleteProfileId: "athlete-private",
  revision: "1",
};

const granted = {
  status: "granted",
  zones: {
    activityCategory: "bike",
    asOf: "2026-08-10T12:00:00.000Z",
    publication: { status: "available", publishedRevision: 1, computedAt: null },
    power: {
      source: {
        availability: "available",
        value: 237.5,
        unit: "watts",
        state: "current",
        freshness: "fresh",
        effectiveAt: "2026-08-10T12:00:00.000Z",
        policyVersion: "v1",
        method: "test",
        calculationVersion: "v1",
        provenance: "validated_threshold",
      },
      zoneAvailability: "available",
      policyVersion: "v1",
      zones: null,
    },
    heartRate: {
      source: {
        availability: "unavailable",
        value: null,
        unit: "beats_per_minute",
        state: "unavailable",
        freshness: "unavailable",
        effectiveAt: null,
        policyVersion: null,
        method: null,
        calculationVersion: null,
        provenance: "unavailable",
      },
      zoneAvailability: "unavailable",
      policyVersion: null,
      zones: null,
    },
  },
} as never;

describe("CoachAthleteZonesSection SSR", () => {
  it("renders denied, granted, and error snapshots without layout-effect or hydration warnings", () => {
    const consoleError = vi.spyOn(console, "error");
    try {
      const denied = renderToString(
        <CoachAthleteZonesSection snapshot={{ ...identity, state: { kind: "denied" } }} />,
      );
      const renderedGranted = renderToString(
        <CoachAthleteZonesSection
          snapshot={{ ...identity, revision: "2", state: { kind: "granted", result: granted } }}
        />,
      );
      const failed = renderToString(
        <CoachAthleteZonesSection
          snapshot={{ ...identity, revision: "3", state: { kind: "failed" } }}
        />,
      );

      expect(denied).toContain("Bike metrics are not available for this athlete.");
      expect(denied).not.toContain("237.5");
      expect(denied).not.toContain(identity.organizationId);
      expect(denied).not.toContain(identity.athleteProfileId);
      expect(renderedGranted).toContain("237.5");
      expect(failed).toContain("Bike zones could not be loaded.");
      expect(failed).not.toContain("237.5");

      const layoutOrHydrationWarnings = consoleError.mock.calls.filter(([message]) =>
        /useLayoutEffect|hydration/i.test(String(message)),
      );
      expect(layoutOrHydrationWarnings).toEqual([]);
    } finally {
      consoleError.mockRestore();
    }
  });
});
