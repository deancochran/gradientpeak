// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CoachAthleteZonesCard } from "./coach-athlete-zones";

const identity = { organizationId: "org-private", athleteProfileId: "athlete-private" };
const zones = {
  asOf: "2026-08-10T12:00:00.000Z",
  activityCategory: "bike",
  publication: { status: "stale", publishedRevision: 3, computedAt: "2026-08-10T11:00:00.000Z" },
  power: {
    source: {
      availability: "available",
      value: 237.5,
      unit: "watts",
      state: "provisional",
      freshness: "stale",
      effectiveAt: "2026-08-09T12:00:00.000Z",
      policyVersion: "cycling_ftp_zones_v1",
      method: "bike_power_30m",
      calculationVersion: "v1",
      provenance: "validated_threshold",
    },
    zoneAvailability: "available",
    policyVersion: "cycling_ftp_zones_v1",
    zones: {
      zone1: { min: 0, max: 130 },
      zone2: { min: 131, max: null },
      zone3: { min: 0, max: 0 },
      zone4: { min: 0, max: 0 },
      zone5: { min: 0, max: 0 },
      zone6: { min: 0, max: 0 },
      zone7: { min: 0, max: null },
    },
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
} as const;

afterEach(cleanup);

describe("CoachAthleteZonesCard", () => {
  it("presents only bike canonical facts with semantic headings and honest stale/provisional labels", () => {
    render(
      <CoachAthleteZonesCard identity={identity} result={{ status: "granted", zones } as never} />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Bike zones" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Power" })).toBeTruthy();
    expect(screen.getByText(/237.5 W/)).toBeTruthy();
    expect(
      screen.getByText(
        /Threshold state: provisional · freshness: stale · provenance: validated threshold · effective at/,
      ),
    ).toBeTruthy();
    expect(screen.getByText("Publication status: stale")).toBeTruthy();
    expect(screen.getByText("Publication revision: 3")).toBeTruthy();
    expect(screen.getByText(/Publication computed at/)).toBeTruthy();
    expect(screen.getByText(/canonical as of/)).toBeTruthy();
    expect(screen.getByText(/Rounded policy reference boundaries/)).toBeTruthy();
    expect(screen.getByText("zone1").parentElement?.textContent).toContain("0 to 130 W");
    expect(screen.getByText(/Threshold unavailable/)).toBeTruthy();
    expect(screen.queryByText(/max hr|run|swim/i)).toBeNull();
    const card = screen.getByTestId("coach-athlete-zones");
    expect(card.className).toContain("bg-slate-950");
    expect(card.className).toContain("text-slate-50");
    expect(screen.getByLabelText("Power").className).toContain("bg-slate-900");
  });

  it("uses explicit unavailable publication copy when the canonical computation time is unknown", () => {
    render(
      <CoachAthleteZonesCard
        identity={identity}
        result={
          {
            status: "granted",
            zones: {
              ...zones,
              publication: { status: "unavailable", publishedRevision: null, computedAt: null },
            },
          } as never
        }
      />,
    );

    expect(screen.getByText("Publication revision: not available")).toBeTruthy();
    expect(screen.getByText(/Publication computed at not available/)).toBeTruthy();
    expect(screen.queryByText(/not published/)).toBeNull();
  });

  it("does not render private identity or prior metric values when access is denied", () => {
    render(<CoachAthleteZonesCard identity={identity} result={{ status: "forbidden" }} />);
    expect(screen.getByText(/not available for this athlete/i)).toBeTruthy();
    expect(screen.queryByText("org-private")).toBeNull();
    expect(screen.queryByText("athlete-private")).toBeNull();
    expect(screen.queryByText("237.5")).toBeNull();
    expect(screen.getByTestId("coach-athlete-zones").className).toContain("bg-slate-950");
  });

  it("shows a local error without retained values and deduplicates retry while pending", () => {
    const retry = vi.fn();
    const view = render(
      <CoachAthleteZonesCard
        identity={identity}
        result={{ status: "granted", zones } as never}
        error
        onRetry={retry}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("could not be loaded");
    expect(screen.queryByText("237.5")).toBeNull();
    expect(screen.getByTestId("coach-athlete-zones").className).toContain("bg-slate-950");
    fireEvent.click(screen.getByRole("button", { name: "Retry bike zones" }));
    expect(retry).toHaveBeenCalledTimes(1);
    view.rerender(<CoachAthleteZonesCard identity={identity} result={null} retryPending />);
    expect(screen.getByText("Loading bike zones…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry bike zones" })).toBeNull();
    expect(screen.getByTestId("coach-athlete-zones").className).toContain("bg-slate-950");
  });
});
