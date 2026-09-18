import { SYSTEM_TEMPLATES } from "@repo/core";
import { describe, expect, it, vi } from "vitest";
import { wahooPlannedActivityRequiredScopes } from "../../integrations/wahoo/planned-activity-scopes";
import { WahooPlannedActivityProvider } from "./wahoo-planned-workout-provider";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

function resolvedStructure() {
  const structure = structuredClone(SYSTEM_TEMPLATES[0]?.structure);
  if (!structure) throw new Error("Missing system template fixture");
  for (const segment of structure.segments) {
    if (segment.role !== "activity") continue;
    for (const interval of segment.intervals) {
      for (const step of interval.steps) step.targets = [{ type: "watts", intensity: 180 }];
    }
  }
  return structure;
}

function fixture(existingLink: { externalId: string; id: string } | null = null) {
  const enqueueJob = vi.fn().mockResolvedValue({ id: "job-1", status: "queued" });
  const wahooRepository = {
    findWahooIntegrationByProfileId: vi.fn().mockResolvedValue({
      id: "integration-1",
      integrationGeneration: 4,
      scope: [...wahooPlannedActivityRequiredScopes, "offline_data"].join(" "),
    }),
    getPlannedSessionForSync: vi.fn().mockResolvedValue({
      plannedSessionId: SESSION_ID,
      planningDate: "2026-07-29",
      timezone: "UTC",
      activityPlan: {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Resolved planned workout",
        description: null,
        structure: resolvedStructure(),
        updatedAt: "2026-07-28T10:00:00.000Z",
      },
    }),
    getPlannedSessionResourceLink: vi.fn().mockResolvedValue(existingLink),
  };
  return {
    enqueueJob,
    wahooRepository,
    provider: new WahooPlannedActivityProvider({
      providerSyncRepository: { enqueueJob } as never,
      wahooRepository: wahooRepository as never,
      now: () => new Date("2026-07-28T12:00:00.000Z"),
    }),
  };
}

describe("WahooPlannedActivityProvider", () => {
  it("queues an immutable planned-session prescription under the planned-session identity", async () => {
    const { enqueueJob, provider, wahooRepository } = fixture();

    await expect(
      provider.enqueuePublishPlannedSession({
        plannedSessionId: SESSION_ID,
        profileId: PROFILE_ID,
      }),
    ).resolves.toEqual({ jobId: "job-1", queued: true });

    expect(wahooRepository.getPlannedSessionForSync).toHaveBeenCalledWith({
      plannedSessionId: SESSION_ID,
      profileId: PROFILE_ID,
    });
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: `wahoo:publish:planned_session:${SESSION_ID}`,
        internalResourceId: SESSION_ID,
        jobType: "wahoo.publish_planned_session",
        resourceKind: "planned_session",
        syncLaneKey: "wahoo:integration-1:planned_session",
        payload: expect.objectContaining({ plannedSessionId: SESSION_ID, operation: "publish" }),
      }),
    );
    expect(enqueueJob.mock.calls[0]?.[0].payload).not.toHaveProperty("eventId");
  });

  it("queues an unsync only with a durable planned-session link", async () => {
    const { enqueueJob, provider } = fixture({ externalId: "remote-1", id: "link-1" });
    await provider.enqueueUnsyncPlannedSession({
      plannedSessionId: SESSION_ID,
      profileId: PROFILE_ID,
      unsyncTarget: { externalId: "remote-1", resourceLinkId: "link-1" },
    });
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        internalResourceId: SESSION_ID,
        jobType: "wahoo.unsync_planned_session",
        resourceKind: "planned_session",
        payload: {
          plannedSessionId: SESSION_ID,
          operation: "unsync",
          unsyncTarget: { externalId: "remote-1", resourceLinkId: "link-1" },
        },
      }),
    );
  });
});
