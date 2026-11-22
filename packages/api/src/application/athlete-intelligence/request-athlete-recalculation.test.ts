import { describe, expect, it, vi } from "vitest";
import {
  buildAthleteRecalculationRequest,
  requestExplicitAthleteRecalculationRepair,
} from "./request-athlete-recalculation";

describe("buildAthleteRecalculationRequest", () => {
  it("canonicalizes several reasons for one athlete queue identity", () => {
    expect(
      buildAthleteRecalculationRequest({
        profileId: "11111111-1111-4111-8111-111111111111",
        earliestAffectedAt: "2026-08-01T00:00:00.000Z",
        earliestAffectedPlanningDate: "2026-08-01",
        sourceRevision: 9,
        reasons: ["threshold_changed", "activity_changed", "threshold_changed"],
        requestedAt: "2026-08-02T00:00:00.000Z",
      }),
    ).toMatchObject({
      idempotencyKey: "athlete-recalculation:11111111-1111-4111-8111-111111111111",
      reasons: ["activity_changed", "threshold_changed"],
      sourceRevision: 9,
    });
  });

  it("turns a supported repair into the next source revision without accepting queue details", async () => {
    const coalesceRecalculationRequest = vi.fn(async ({ request }) => request);
    const repository = {
      lockPublicationState: vi.fn(async () => ({
        profileId: "11111111-1111-4111-8111-111111111111",
        planningTimezone: "UTC",
        sourceRevision: 9,
        publishedRevision: 9,
        dirtyFromAt: null,
        fitness: 40,
        fatigue: 35,
        evidenceConfidence: 0.8,
        coverageStartAt: "2026-08-01T00:00:00.000Z",
        coverageEndAt: "2026-08-10T00:00:00.000Z",
        lastActivityAt: "2026-08-10T00:00:00.000Z",
        calculationVersion: "v1",
        computedAt: "2026-08-10T00:00:00.000Z",
        leaseToken: null,
        leaseExpiresAt: null,
      })),
      coalesceRecalculationRequest,
    };
    await expect(
      requestExplicitAthleteRecalculationRepair({
        db: {} as never,
        profileId: "11111111-1111-4111-8111-111111111111",
        requestedAt: new Date("2026-08-16T12:00:00.000Z"),
        repositoryFactory: () => repository as never,
      }),
    ).resolves.toEqual({
      status: "accepted",
      profileId: "11111111-1111-4111-8111-111111111111",
    });
    expect(coalesceRecalculationRequest).toHaveBeenCalledWith({
      profileId: "11111111-1111-4111-8111-111111111111",
      request: expect.objectContaining({
        sourceRevision: 10,
        reasons: ["explicit_repair"],
        earliestAffectedAt: "2026-08-01T00:00:00.000Z",
      }),
    });
  });
});
