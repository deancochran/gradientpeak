import {
  type AthletePerformanceTargetFacts,
  athletePerformanceTargetFactsSchema,
  createUnavailableAthletePerformanceTargetFacts,
  SYSTEM_TEMPLATES,
} from "@repo/core";
import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WahooPlannedActivityProvider } from "./wahoo-planned-workout-provider";

const operationTime = new Date("2026-07-28T12:00:00.000Z");

function performanceTargets(
  overrides: Partial<AthletePerformanceTargetFacts> = {},
): AthletePerformanceTargetFacts {
  return athletePerformanceTargetFactsSchema.parse({
    ...buildPerformanceTargetFactsFixture({
      asOf: operationTime.toISOString(),
      athleteId: "profile-1",
      planningThresholdPowerWatts: 250,
      lthrBpm: { bike: 170, run: 175 },
      maxHrBpm: { bike: 190, run: 195 },
    }),
    ...overrides,
  });
}

function planWithRelativeTarget(type: "%FTP" | "%ThresholdHR", activityCategory: "bike" | "run") {
  const template = SYSTEM_TEMPLATES[0];
  if (!template) throw new Error("Expected a system template fixture");
  const structure = structuredClone(template.structure);
  for (const segment of structure.segments) {
    if (segment.role !== "activity") continue;
    segment.activity_category = activityCategory;
    for (const interval of segment.intervals) {
      for (const step of interval.steps) step.targets = [{ type, intensity: 80 }];
    }
  }
  return structure;
}

function providerFixture(
  overrides: {
    enqueueJob?: ReturnType<typeof vi.fn>;
    existingLink?: { externalId: string; id: string } | null;
    planStructure?: unknown;
    now?: Date;
    routeId?: string | null;
    scope?: string;
    startsAt?: string;
    performanceTargets?: AthletePerformanceTargetFacts;
  } = {},
) {
  const enqueueJob =
    overrides.enqueueJob ?? vi.fn().mockResolvedValue({ id: "job-1", status: "queued" });
  const providerSyncRepository = { enqueueJob };
  const wahooRepository = {
    findWahooIntegrationByProfileId: vi.fn().mockResolvedValue({
      id: "integration-1",
      integrationGeneration: 4,
      scope: overrides.scope ?? "plans_read plans_write workouts_read workouts_write offline_data",
    }),
    getPlannedEventForSync: vi.fn().mockResolvedValue({
      activityPlan: {
        description: "Bike session",
        id: "plan-1",
        name: "Tempo Intervals",
        structure: overrides.planStructure ?? SYSTEM_TEMPLATES[0]?.structure,
        updatedAt: "2026-07-28T10:00:00.000Z",
      },
      id: "event-1",
      routeId: overrides.routeId ?? null,
      startsAt: overrides.startsAt ?? "2026-07-29T12:00:00.000Z",
    }),
    getEventResourceLink: vi.fn().mockResolvedValue(overrides.existingLink ?? null),
  };
  const getPerformanceTargets = vi
    .fn()
    .mockResolvedValue(overrides.performanceTargets ?? performanceTargets());
  return {
    enqueueJob,
    provider: new WahooPlannedActivityProvider({
      providerSyncRepository: providerSyncRepository as never,
      wahooRepository: wahooRepository as never,
      getPerformanceTargets,
      now: () => overrides.now ?? operationTime,
    }),
    providerSyncRepository,
    wahooRepository,
    getPerformanceTargets,
  };
}

describe("WahooPlannedActivityProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("always enqueues an eligible profile-owned bike activity with generation and lane metadata", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(operationTime);
    const { enqueueJob, getPerformanceTargets, provider } = providerFixture();

    await expect(
      provider.enqueuePublishEvent({ eventId: "event-1", profileId: "profile-1" }),
    ).resolves.toEqual({ jobId: "job-1", queued: true });

    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: "wahoo:publish:event:event-1",
        integrationGeneration: 4,
        integrationId: "integration-1",
        internalResourceId: "event-1",
        jobType: "wahoo.publish_event",
        operation: "publish",
        payloadHash: expect.any(String),
        priority: 50,
        profileId: "profile-1",
        runAt: "2026-07-28T12:00:00.000Z",
        syncLaneKey: "wahoo:integration-1:planned_activity",
      }),
    );
    expect(enqueueJob.mock.calls[0]?.[0].payload).toMatchObject({
      performanceModelAsOf: operationTime.toISOString(),
      eventId: "event-1",
      operation: "publish",
      projectionHash: expect.any(String),
      projectionSnapshot: expect.objectContaining({
        plan: expect.objectContaining({ header: expect.objectContaining({ ftp: 250 }) }),
      }),
      startsAt: "2026-07-29T12:00:00.000Z",
    });
    expect(getPerformanceTargets).toHaveBeenCalledWith({
      actorProfileId: "profile-1",
      asOf: operationTime,
    });
  });

  it("changes queued desired state when the scheduled time changes", async () => {
    const first = providerFixture({ startsAt: "2026-07-29T12:00:00.000Z" });
    const second = providerFixture({ startsAt: "2026-07-29T13:00:00.000Z" });

    await first.provider.enqueuePublishEvent({ eventId: "event-1", profileId: "profile-1" });
    await second.provider.enqueuePublishEvent({ eventId: "event-1", profileId: "profile-1" });

    expect(first.enqueueJob.mock.calls[0]?.[0].payloadHash).not.toBe(
      second.enqueueJob.mock.calls[0]?.[0].payloadHash,
    );
  });

  it("keeps provider desired-state hashing stable when only model evaluation time changes", async () => {
    const first = providerFixture({ now: operationTime });
    const second = providerFixture({ now: new Date(operationTime.getTime() + 60_000) });

    await first.provider.enqueuePublishEvent({ eventId: "event-1", profileId: "profile-1" });
    await second.provider.enqueuePublishEvent({ eventId: "event-1", profileId: "profile-1" });

    expect(first.enqueueJob.mock.calls[0]?.[0].payloadHash).toBe(
      second.enqueueJob.mock.calls[0]?.[0].payloadHash,
    );
    expect(first.enqueueJob.mock.calls[0]?.[0].payload.performanceModelAsOf).not.toBe(
      second.enqueueJob.mock.calls[0]?.[0].payload.performanceModelAsOf,
    );
  });

  it("serializes different events in the integration lane because Wahoo plans can be shared", async () => {
    const { enqueueJob, provider } = providerFixture();

    await provider.enqueuePublishEvent({ eventId: "event-1", profileId: "profile-1" });
    await provider.enqueuePublishEvent({ eventId: "event-2", profileId: "profile-1" });

    expect(enqueueJob.mock.calls.map(([job]) => job.syncLaneKey)).toEqual([
      "wahoo:integration-1:planned_activity",
      "wahoo:integration-1:planned_activity",
    ]);
  });

  it("schedules far-future delivery at the six-day horizon", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T12:00:00.000Z"));
    const { enqueueJob, provider } = providerFixture({
      startsAt: "2026-08-10T12:00:00.000Z",
    });

    await provider.enqueuePublishEvent({ eventId: "event-1", profileId: "profile-1" });

    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({ runAt: "2026-08-04T12:00:00.000Z" }),
    );
  });

  it("immediately queues an eligible workout whose start time already passed", async () => {
    const now = new Date("2026-07-29T22:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const { enqueueJob, provider } = providerFixture({
      now,
      startsAt: "2026-07-29T06:00:00.000Z",
    });

    await provider.enqueuePublishEvent({ eventId: "event-1", profileId: "profile-1" });

    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: 50,
        runAt: "2026-07-29T22:00:00.000Z",
      }),
    );
    expect(enqueueJob.mock.calls[0]?.[0].payload).toMatchObject({
      startsAt: "2026-07-29T06:00:00.000Z",
    });
  });

  it("uses a transaction-provided enqueue function", async () => {
    const transactionEnqueue = vi.fn().mockResolvedValue({ id: "tx-job", status: "queued" });
    const fixture = providerFixture();
    const provider = new WahooPlannedActivityProvider({
      enqueueJob: transactionEnqueue as never,
      providerSyncRepository: fixture.providerSyncRepository as never,
      wahooRepository: fixture.wahooRepository as never,
      getPerformanceTargets: fixture.getPerformanceTargets,
      now: () => operationTime,
    });

    await provider.enqueuePublishEvent({ eventId: "event-1", profileId: "profile-1" });

    expect(transactionEnqueue).toHaveBeenCalledTimes(1);
    expect(fixture.enqueueJob).not.toHaveBeenCalled();
  });

  it("requires planned-activity OAuth grants before enqueue", async () => {
    const { enqueueJob, provider } = providerFixture({ scope: "workouts_read offline_data" });

    await expect(
      provider.enqueuePublishEvent({ eventId: "event-1", profileId: "profile-1" }),
    ).rejects.toThrow("reconnect");
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("fails closed before enqueue when a selected relative target is unavailable", async () => {
    const { enqueueJob, provider } = providerFixture({
      performanceTargets: createUnavailableAthletePerformanceTargetFacts(
        operationTime.toISOString(),
        "profile-1",
      ),
      existingLink: { externalId: "remote-1", id: "link-1" },
      planStructure: planWithRelativeTarget("%FTP", "bike"),
    });

    await expect(
      provider.enqueuePublishEvent({ eventId: "event-1", profileId: "profile-1" }),
    ).rejects.toThrow("performance target unavailable");
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("skips route-linked activities without blocking calendar writes while route push is incomplete", async () => {
    const { enqueueJob, provider } = providerFixture({ routeId: "route-1" });

    await expect(
      provider.enqueuePublishEvent({ eventId: "event-1", profileId: "profile-1" }),
    ).resolves.toEqual({ jobId: null, queued: false, skipped: true });
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("unsyncs an existing planned activity when the event becomes route-linked", async () => {
    const { enqueueJob, provider } = providerFixture({
      existingLink: { externalId: "remote-1", id: "link-1" },
      routeId: "route-1",
    });

    await expect(
      provider.enqueuePublishEvent({ eventId: "event-1", profileId: "profile-1" }),
    ).resolves.toEqual({ jobId: "job-1", queued: true });
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: "wahoo.unsync_event",
        payload: {
          eventId: "event-1",
          operation: "unsync",
          unsyncTarget: { externalId: "remote-1", resourceLinkId: "link-1" },
        },
      }),
    );
  });

  it("queues unsync when an existing export is edited to an unsupported activity category", async () => {
    const unsupported = SYSTEM_TEMPLATES.find((template) =>
      template.structure.segments.some(
        (segment) => segment.role === "activity" && segment.activity_category === "strength",
      ),
    );
    if (!unsupported) throw new Error("Expected a strength system template fixture");
    const { enqueueJob, provider } = providerFixture({
      existingLink: { externalId: "remote-1", id: "link-1" },
      planStructure: unsupported.structure,
    });

    await expect(
      provider.enqueuePublishEvent({ eventId: "event-1", profileId: "profile-1" }),
    ).resolves.toEqual({ jobId: "job-1", queued: true });
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: "wahoo.unsync_event",
        payload: {
          eventId: "event-1",
          operation: "unsync",
          unsyncTarget: { externalId: "remote-1", resourceLinkId: "link-1" },
        },
      }),
    );
  });

  it("captures an authoritative unsync target in a generation-fenced lane", async () => {
    const { enqueueJob, provider } = providerFixture();

    await provider.enqueueUnsyncEvent({
      eventId: "event-1",
      profileId: "profile-1",
      unsyncTarget: { externalId: "remote-1", resourceLinkId: "link-1" },
    });

    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationGeneration: 4,
        jobType: "wahoo.unsync_event",
        priority: 50,
        payload: {
          eventId: "event-1",
          operation: "unsync",
          unsyncTarget: { externalId: "remote-1", resourceLinkId: "link-1" },
        },
      }),
    );
  });
});
