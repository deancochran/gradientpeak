import { describe, expect, it } from "vitest";

import { resolveRecordingGuidancePolicy } from "../recording-guidance-policy";

describe("recording guidance policy", () => {
  it("classifies a free session with no route or structure", () => {
    const policy = resolveRecordingGuidancePolicy({
      gpsMode: "off",
      routeAttached: false,
    });

    expect(policy.guidanceKind).toBe("free");
    expect(policy.evaluableMetrics).toEqual(["time"]);
    expect(policy.trainerAuthorities).toEqual({
      available: ["manual"],
      simultaneousControlAllowed: true,
      reasons: [],
    });
  });

  it("supports GPS-backed route guidance without structure", () => {
    const policy = resolveRecordingGuidancePolicy({
      gpsMode: "on",
      routeAttached: true,
    });

    expect(policy.guidanceKind).toBe("route_only");
    expect(policy.evaluableMetrics).toEqual(
      expect.arrayContaining(["time", "distance", "position", "route_progress", "grade"]),
    );
    expect(policy.trainerAuthorities.available).toEqual(["manual", "route_simulation"]);
    expect(policy.trainerAuthorities.simultaneousControlAllowed).toBe(true);
  });

  it("derives plan metric evaluation from structured targets", () => {
    const policy = resolveRecordingGuidancePolicy({
      gpsMode: "off",
      routeAttached: false,
      structure: {
        version: 2,
        intervals: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Main",
            repetitions: 1,
            steps: [
              {
                id: "22222222-2222-4222-8222-222222222222",
                name: "Threshold",
                duration: { type: "time", seconds: 600 },
                targets: [
                  { type: "watts", intensity: 260 },
                  { type: "bpm", intensity: 170 },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(policy.guidanceKind).toBe("structured_only");
    expect(policy.targetMetrics).toEqual(expect.arrayContaining(["power", "heart_rate"]));
    expect(policy.trainerAuthorities.available).toEqual(["manual", "plan_targets"]);
    expect(policy.trainerAuthorities.simultaneousControlAllowed).toBe(true);
  });

  it("reports route plus plan trainer-authority conflicts without banning the combination", () => {
    const policy = resolveRecordingGuidancePolicy({
      gpsMode: "off",
      routeAttached: true,
      structure: {
        version: 2,
        intervals: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Main",
            repetitions: 1,
            steps: [
              {
                id: "44444444-4444-4444-8444-444444444444",
                name: "Tempo",
                duration: { type: "time", seconds: 900 },
                targets: [{ type: "watts", intensity: 250 }],
              },
            ],
          },
        ],
      },
    });

    expect(policy.guidanceKind).toBe("structured_with_route");
    expect(policy.trainerAuthorities.available).toEqual([
      "manual",
      "route_simulation",
      "plan_targets",
    ]);
    expect(policy.trainerAuthorities.simultaneousControlAllowed).toBe(false);
    expect(policy.trainerAuthorities.reasons).toEqual(
      expect.arrayContaining([
        "Route simulation and plan-driven trainer targets require different trainer authorities and cannot auto-control the same trainer simultaneously.",
      ]),
    );
  });

  it("surfaces structural conflicts for route-backed plans", () => {
    const policy = resolveRecordingGuidancePolicy({
      gpsMode: "off",
      routeAttached: true,
      structure: {
        version: 2,
        intervals: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            name: "Main",
            repetitions: 1,
            steps: [
              {
                id: "66666666-6666-4666-8666-666666666666",
                name: "Spatial Conflict",
                duration: { type: "distance", meters: 1000 },
                targets: [{ type: "speed", intensity: 4.5 }],
              },
            ],
          },
        ],
      },
    });

    expect(policy.conflicts).toEqual(
      expect.arrayContaining([
        "Route-guided plans cannot use distance-based step durations because the route already defines spatial progress.",
        "Route-guided plans cannot use speed targets because route simulation owns spatial guidance.",
      ]),
    );
  });
});
