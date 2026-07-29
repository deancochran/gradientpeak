import { SYSTEM_TEMPLATES } from "@repo/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WahooPlannedActivityProvider } from "./wahoo-planned-workout-provider";

function providerFixture(
  overrides: {
    enqueueJob?: ReturnType<typeof vi.fn>;
    existingLink?: { externalId: string; id: string } | null;
    planStructure?: unknown;
    routeId?: string | null;
    scope?: string;
    startsAt?: string;
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
    getProfileSyncMetrics: vi.fn().mockResolvedValue({
      bikePowerEfforts: [],
      ftpMetrics: [{ observedAt: "2026-07-28T10:00:00.000Z", source: "manual", value: 250 }],
      maxHr: 190,
      thresholdHr: 170,
    }),
  };
  return {
    enqueueJob,
    provider: new WahooPlannedActivityProvider({
      providerSyncRepository: providerSyncRepository as never,
      wahooRepository: wahooRepository as never,
    }),
    providerSyncRepository,
    wahooRepository,
  };
}

describe("WahooPlannedActivityProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("always enqueues an eligible profile-owned bike activity with generation and lane metadata", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T12:00:00.000Z"));
    const { enqueueJob, provider } = providerFixture();

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
        profileId: "profile-1",
        runAt: "2026-07-28T12:00:00.000Z",
        syncLaneKey: "wahoo:integration-1:planned_activity",
      }),
    );
    expect(enqueueJob.mock.calls[0]?.[0].payload).toMatchObject({
      eventId: "event-1",
      operation: "publish",
      projectionHash: expect.any(String),
      startsAt: "2026-07-29T12:00:00.000Z",
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

  it("uses a transaction-provided enqueue function", async () => {
    const transactionEnqueue = vi.fn().mockResolvedValue({ id: "tx-job", status: "queued" });
    const fixture = providerFixture();
    const provider = new WahooPlannedActivityProvider({
      enqueueJob: transactionEnqueue as never,
      providerSyncRepository: fixture.providerSyncRepository as never,
      wahooRepository: fixture.wahooRepository as never,
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
        payload: {
          eventId: "event-1",
          operation: "unsync",
          unsyncTarget: { externalId: "remote-1", resourceLinkId: "link-1" },
        },
      }),
    );
  });
});
