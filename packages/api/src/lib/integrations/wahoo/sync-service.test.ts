import * as core from "@repo/core";
import { describe, expect, it, vi } from "vitest";
import { decideRouteOnlyWahooConvergence, WahooSyncService } from "./sync-service";

const integration = {
  accessToken: "access-token",
  credentialGeneration: 1,
  expiresAt: "2099-01-01T00:00:00.000Z",
  externalId: "wahoo-user-1",
  id: "integration-1",
  integrationGeneration: 3,
  profileId: "profile-1",
  reconnectRequiredAt: null,
  refreshToken: "refresh-token",
  scope:
    "plans_read plans_write workouts_read workouts_write routes_read routes_write offline_data",
};

function remoteWorkout(overrides: Record<string, unknown> = {}) {
  return {
    created_at: "2026-07-28T12:00:00.000Z",
    id: 99,
    minutes: 60,
    name: "Tempo Intervals",
    plan_id: 42,
    plan_ids: [42],
    starts: "2026-07-29T12:00:00.000Z",
    updated_at: "2026-07-28T12:00:00.000Z",
    workout_token: "event-1",
    workout_type_id: 0,
    ...overrides,
  };
}

function remoteRoute(overrides: Record<string, unknown> = {}) {
  return {
    ascent: 20,
    created_at: "2026-07-28T12:00:00.000Z",
    deleted: false,
    descent: 18,
    description: "Ridge loop",
    distance: 1000,
    external_id: "gradientpeak:route:route-1",
    file: { url: "https://example.com/route.fit" },
    id: 77,
    name: "Ridge Loop",
    provider_updated_at: "2026-07-28T10:00:00.000Z",
    start_lat: 35,
    start_lng: -85,
    updated_at: "2026-07-28T12:00:00.000Z",
    user_id: 1,
    workout_type_family_id: 255,
    ...overrides,
  };
}

function syncFixture(
  input: {
    existingLink?: Record<string, unknown> | null;
    planStructure?: unknown;
    repository?: Record<string, unknown>;
    routeContent?: string | null;
    routeId?: string | null;
    wahooClient?: Record<string, unknown>;
  } = {},
) {
  const existingLink =
    input.existingLink === undefined || input.existingLink === null
      ? null
      : {
          providerMetadata: {
            wahoo: { providerAccountExternalId: "wahoo-user-1" },
          },
          ...input.existingLink,
        };
  const repository = {
    createEventResourceLink: vi.fn().mockResolvedValue(undefined),
    createGroupEventRouteDeliveryResourceLink: vi.fn().mockResolvedValue(undefined),
    createRouteResourceLink: vi.fn().mockResolvedValue(undefined),
    deleteEventResourceLink: vi.fn().mockResolvedValue(undefined),
    deleteGroupEventRouteDeliveryResourceLink: vi.fn().mockResolvedValue(undefined),
    deleteRouteResourceLink: vi.fn().mockResolvedValue(undefined),
    findWahooIntegrationByIdAndGeneration: vi.fn().mockResolvedValue({ profileId: "profile-1" }),
    findWahooIntegrationByProfileId: vi.fn().mockResolvedValue(integration),
    getEventResourceLink: vi.fn().mockResolvedValue(existingLink),
    getGroupEventRouteDeliveryResourceLink: vi.fn().mockResolvedValue(null),
    getGroupEventRouteForDelivery: vi.fn().mockResolvedValue({
      description: "Ridge loop",
      filePath: "source/route-1.gpx",
      id: "route-1",
      name: "Ridge Loop",
      totalAscent: 20,
      totalDescent: 18,
      totalDistance: 1000,
      updatedAt: "2026-07-28T10:00:00.000Z",
    }),
    getPlannedEventForSync: vi.fn().mockResolvedValue({
      activityPlan: {
        description: "Bike session",
        id: "plan-1",
        name: "Tempo Intervals",
        structure: input.planStructure ?? core.SYSTEM_TEMPLATES[0]?.structure,
        updatedAt: "2026-07-28T10:00:00.000Z",
      },
      id: "event-1",
      routeId: input.routeId ?? null,
      startsAt: "2026-07-29T12:00:00.000Z",
    }),
    getProfileSyncMetrics: vi.fn().mockResolvedValue({
      bikePowerEfforts: [],
      ftpMetrics: [{ observedAt: "2026-07-28T10:00:00.000Z", source: "manual", value: 250 }],
      maxHr: 190,
      thresholdHr: 170,
    }),
    getOwnedRouteForMirror: vi.fn().mockResolvedValue({
      description: "Ridge loop",
      filePath: "profile-1/route-1.gpx",
      id: "route-1",
      name: "Ridge Loop",
      totalAscent: 20,
      totalDescent: 18,
      totalDistance: 1000,
      updatedAt: "2026-07-28T10:00:00.000Z",
    }),
    getRouteResourceLink: vi.fn().mockResolvedValue(null),
    isWahooPlanReferencedByOtherEvent: vi.fn().mockResolvedValue(false),
    listEventResourceLinks: vi.fn().mockResolvedValue([]),
    markWahooReconnectRequired: vi.fn().mockResolvedValue(true),
    updateEventResourceLink: vi.fn().mockResolvedValue(undefined),
    updateGroupEventRouteDeliveryResourceLink: vi.fn().mockResolvedValue(undefined),
    updateRouteResourceLink: vi.fn().mockResolvedValue(undefined),
    updateWahooIntegrationTokens: vi.fn().mockResolvedValue(2),
    ...input.repository,
  };
  const wahooClient = {
    createPlan: vi.fn(),
    createRoute: vi.fn().mockResolvedValue(remoteRoute()),
    createWorkout: vi.fn().mockResolvedValue(remoteWorkout()),
    deletePlan: vi.fn().mockResolvedValue({ success: true }),
    deleteWorkout: vi.fn().mockResolvedValue({ success: true }),
    deleteRoute: vi.fn().mockResolvedValue({ success: true }),
    findWorkoutByToken: vi.fn().mockResolvedValue({ complete: true, workout: null }),
    getPlans: vi.fn().mockResolvedValue([
      {
        deleted: false,
        external_id: "plan-external-1",
        id: 42,
        name: "Tempo Intervals",
        provider_updated_at: "2026-07-28T10:00:00.000Z",
      },
    ]),
    getRoutes: vi.fn().mockResolvedValue([]),
    getWorkout: vi.fn(),
    updateWorkout: vi.fn().mockResolvedValue({ success: true }),
    updateRoute: vi.fn().mockResolvedValue(remoteRoute()),
    ...input.wahooClient,
  };
  const service = new WahooSyncService({
    repository: repository as never,
    storage: {
      downloadRouteGpx: vi
        .fn()
        .mockResolvedValue(
          input.routeContent === undefined
            ? '<?xml version="1.0"?><gpx><trk><trkseg><trkpt lat="35" lon="-85"><ele>100</ele></trkpt><trkpt lat="35.001" lon="-85.001"><ele>105</ele></trkpt></trkseg></trk></gpx>'
            : input.routeContent,
        ),
    },
    wahooClientFactory: () => wahooClient as never,
  });
  const execution = {
    expectedIntegrationGeneration: 3,
    expectedStartsAt: "2026-07-29T12:00:00.000Z",
    integrationId: "integration-1",
    signal: new AbortController().signal,
  };
  return { execution, repository, service, wahooClient };
}

describe("WahooSyncService group event route delivery", () => {
  const deliveryExecution = {
    expectedIntegrationGeneration: 3,
    integrationId: "integration-1",
    profileId: "profile-1",
    providerAccountExternalId: "wahoo-user-1",
  };

  it("delivers an eligible public source without using the owned-route path", async () => {
    const { repository, service, wahooClient } = syncFixture({
      wahooClient: {
        createRoute: vi
          .fn()
          .mockResolvedValue(
            remoteRoute({ external_id: "gradientpeak:group-event:event-1:profile-1" }),
          ),
        getRoutes: vi.fn().mockResolvedValue([]),
      },
    });

    await expect(
      service.syncGroupEventRouteDelivery(
        "event-1",
        "profile-1",
        "public-route-1",
        "gradientpeak:group-event:event-1:profile-1",
        deliveryExecution,
      ),
    ).resolves.toMatchObject({ action: "created", success: true });

    expect(repository.getOwnedRouteForMirror).not.toHaveBeenCalled();
    expect(repository.createRouteResourceLink).not.toHaveBeenCalled();
    expect(wahooClient.createRoute).toHaveBeenCalledOnce();
    expect(repository.createGroupEventRouteDeliveryResourceLink).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        integrationId: "integration-1",
        profileId: "profile-1",
      }),
    );
  });

  it("skips delivery when current group-event eligibility is absent", async () => {
    const { repository, service, wahooClient } = syncFixture({
      repository: { getGroupEventRouteForDelivery: vi.fn().mockResolvedValue(null) },
    });

    await expect(
      service.syncGroupEventRouteDelivery(
        "event-1",
        "profile-1",
        "route-1",
        "external-1",
        deliveryExecution,
      ),
    ).resolves.toEqual({ action: "no_change", success: true, terminalOutcome: "skipped" });
    expect(wahooClient.createRoute).not.toHaveBeenCalled();
    expect(repository.findWahooIntegrationByProfileId).toHaveBeenCalled();
  });

  it("removes a delivered route after RSVP or sharing eligibility is revoked", async () => {
    const { repository, service, wahooClient } = syncFixture({
      repository: {
        getGroupEventRouteDeliveryResourceLink: vi.fn().mockResolvedValue({
          externalId: "77",
          id: "delivery-link-1",
          integrationId: "integration-1",
          payloadHash: "hash",
          providerMetadata: {
            wahoo: { providerAccountExternalId: "wahoo-user-1", sourceRouteId: "route-1" },
          },
          providerUpdatedAt: "2026-07-28T10:00:00.000Z",
          updatedAt: "2026-07-28T10:00:00.000Z",
        }),
        getGroupEventRouteForDelivery: vi.fn().mockResolvedValue(null),
      },
      wahooClient: {
        getRoutes: vi.fn().mockResolvedValue([remoteRoute({ external_id: "external-1" })]),
      },
    });

    await expect(
      service.syncGroupEventRouteDelivery(
        "event-1",
        "profile-1",
        "route-1",
        "external-1",
        deliveryExecution,
      ),
    ).resolves.toMatchObject({ action: "updated", success: true, terminalOutcome: "skipped" });
    expect(wahooClient.deleteRoute).toHaveBeenCalledWith("77", undefined);
    expect(repository.deleteGroupEventRouteDeliveryResourceLink).toHaveBeenCalledWith({
      eventId: "event-1",
      expectedIntegrationGeneration: 3,
      id: "delivery-link-1",
      integrationId: "integration-1",
      profileId: "profile-1",
    });
  });

  it("fails closed for account mismatch and ambiguous provider create response", async () => {
    const mismatch = syncFixture();
    await expect(
      mismatch.service.syncGroupEventRouteDelivery(
        "event-1",
        "profile-1",
        "route-1",
        "external-1",
        {
          ...deliveryExecution,
          providerAccountExternalId: "other-account",
        },
      ),
    ).resolves.toMatchObject({ failureCode: "provider_account_mismatch", success: false });
    expect(mismatch.wahooClient.createRoute).not.toHaveBeenCalled();

    const ambiguous = syncFixture({
      wahooClient: {
        createRoute: vi.fn().mockResolvedValue(remoteRoute({ external_id: "wrong" })),
        getRoutes: vi.fn().mockResolvedValue([]),
      },
    });
    await expect(
      ambiguous.service.syncGroupEventRouteDelivery(
        "event-1",
        "profile-1",
        "route-1",
        "external-1",
        deliveryExecution,
      ),
    ).resolves.toMatchObject({ failureCode: "ambiguous_create", success: false });
    expect(ambiguous.repository.createGroupEventRouteDeliveryResourceLink).not.toHaveBeenCalled();
  });
});

describe("WahooSyncService planned-activity validation", () => {
  it("rejects a durable mixed-plan job before provider projection or effects", async () => {
    const capability = vi
      .spyOn(core, "getProviderCapabilityUnavailableReason")
      .mockReturnValue(null);
    const template = core.SYSTEM_TEMPLATES[0];
    if (!template) throw new Error("Expected a system template fixture");
    const source: core.ActivityPlanStructureV3 = structuredClone(template.structure);
    const sourceSegment = source.segments.find((segment) => segment.role === "activity");
    if (!sourceSegment) throw new Error("Expected an activity segment fixture");
    const duplicateSegment = structuredClone(sourceSegment);
    duplicateSegment.activity_category =
      duplicateSegment.activity_category === "run" ? "bike" : "run";
    const repository = {
      findWahooIntegrationByProfileId: vi.fn(),
      getEventResourceLink: vi.fn().mockResolvedValue(null),
      getPlannedEventForSync: vi.fn(async () => ({
        id: "event-1",
        startsAt: "2026-07-13T10:00:00.000Z",
        routeId: null,
        activityPlan: {
          id: "plan-1",
          name: "Legacy mixed",
          description: null,
          structure: { ...source, segments: [...source.segments, duplicateSegment] },
        },
      })),
    };
    const service = new WahooSyncService({
      repository: repository as never,
      storage: { downloadRouteGpx: vi.fn() },
    });

    await expect(service.syncEvent("event-1", "profile-1")).resolves.toMatchObject({
      failureCode: "invalid_plan",
      success: false,
    });
    expect(repository.findWahooIntegrationByProfileId).not.toHaveBeenCalled();
    capability.mockRestore();
  });
});

describe("route-only Wahoo convergence decision", () => {
  it("only performs cleanup for a stale route-only resource link", () => {
    expect(
      decideRouteOnlyWahooConvergence({
        hasActivityPlan: false,
        hasEventRoute: true,
        hasExistingResourceLink: true,
      }),
    ).toBe("cleanup_then_unsupported");
    expect(
      decideRouteOnlyWahooConvergence({
        hasActivityPlan: false,
        hasEventRoute: true,
        hasExistingResourceLink: false,
      }),
    ).toBe("unsupported_target");
    expect(
      decideRouteOnlyWahooConvergence({
        hasActivityPlan: false,
        hasEventRoute: false,
        hasExistingResourceLink: true,
      }),
    ).toBe("missing_plan");
  });
});

describe("WahooSyncService planned-activity reconciliation", () => {
  it("creates one Wahoo planned-activity resource and a generation-guarded local link", async () => {
    const { execution, repository, service, wahooClient } = syncFixture();

    await expect(service.syncEvent("event-1", "profile-1", execution)).resolves.toMatchObject({
      action: "created",
      success: true,
      workoutId: "99",
    });

    expect(wahooClient.createWorkout).toHaveBeenCalledTimes(1);
    expect(wahooClient.createWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: "event-1", planId: 42 }),
      execution.signal,
    );
    expect(repository.createEventResourceLink).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        expectedIntegrationGeneration: 3,
        externalId: "99",
        integrationId: "integration-1",
        profileId: "profile-1",
      }),
    );
  });

  it("terminalizes a queued publish whose scheduled time was superseded", async () => {
    const { execution, repository, service, wahooClient } = syncFixture();

    await expect(
      service.syncEvent("event-1", "profile-1", {
        ...execution,
        expectedStartsAt: "2026-07-29T11:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      action: "no_change",
      success: true,
      terminalOutcome: "superseded",
    });
    expect(repository.findWahooIntegrationByProfileId).not.toHaveBeenCalled();
    expect(wahooClient.createPlan).not.toHaveBeenCalled();
    expect(wahooClient.createWorkout).not.toHaveBeenCalled();
  });

  it("stops before provider creation when durable integration authority changed", async () => {
    const { execution, repository, service, wahooClient } = syncFixture({
      repository: {
        findWahooIntegrationByIdAndGeneration: vi.fn().mockResolvedValue(null),
      },
    });

    await expect(service.syncEvent("event-1", "profile-1", execution)).resolves.toMatchObject({
      action: "no_change",
      success: true,
      terminalOutcome: "superseded",
    });
    expect(repository.findWahooIntegrationByIdAndGeneration).toHaveBeenCalledWith({
      integrationGeneration: 3,
      integrationId: "integration-1",
    });
    expect(wahooClient.createPlan).not.toHaveBeenCalled();
    expect(wahooClient.createWorkout).not.toHaveBeenCalled();
  });

  it("adopts and updates an existing Wahoo planned-activity resource token without another POST", async () => {
    const existing = remoteWorkout({ name: "Old name", plan_id: 1 });
    const { execution, service, wahooClient } = syncFixture({
      wahooClient: {
        findWorkoutByToken: vi.fn().mockResolvedValue({ complete: true, workout: existing }),
      },
    });

    await expect(service.syncEvent("event-1", "profile-1", execution)).resolves.toMatchObject({
      success: true,
      workoutId: "99",
    });

    expect(wahooClient.createWorkout).not.toHaveBeenCalled();
    expect(wahooClient.updateWorkout).toHaveBeenCalledWith(
      "99",
      expect.objectContaining({ name: "Tempo Intervals", planId: 42 }),
      execution.signal,
    );
  });

  it("fails closed when token lookup is incomplete", async () => {
    const { execution, service, wahooClient } = syncFixture({
      wahooClient: {
        findWorkoutByToken: vi.fn().mockResolvedValue({ complete: false, workout: null }),
      },
    });

    await expect(service.syncEvent("event-1", "profile-1", execution)).resolves.toMatchObject({
      failureCode: "ambiguous_create",
      retryable: false,
      success: false,
    });
    expect(wahooClient.createWorkout).not.toHaveBeenCalled();
  });

  it("does not adopt a token match from an incomplete reconciliation scan", async () => {
    const existing = remoteWorkout();
    const { execution, service, wahooClient } = syncFixture({
      wahooClient: {
        findWorkoutByToken: vi.fn().mockResolvedValue({ complete: false, workout: existing }),
      },
    });

    await expect(service.syncEvent("event-1", "profile-1", execution)).resolves.toMatchObject({
      failureCode: "ambiguous_create",
      retryable: false,
      success: false,
    });
    expect(wahooClient.updateWorkout).not.toHaveBeenCalled();
    expect(wahooClient.createWorkout).not.toHaveBeenCalled();
  });

  it("dead-letters an ambiguous planned-activity resource create instead of blindly retrying POST", async () => {
    const findWorkoutByToken = vi
      .fn()
      .mockResolvedValueOnce({ complete: true, workout: null })
      .mockResolvedValueOnce({ complete: true, workout: null });
    const { execution, service, wahooClient } = syncFixture({
      wahooClient: {
        createWorkout: vi.fn().mockRejectedValue(new Error("socket closed")),
        findWorkoutByToken,
      },
    });

    await expect(service.syncEvent("event-1", "profile-1", execution)).resolves.toMatchObject({
      failureCode: "ambiguous_create",
      retryable: false,
      success: false,
    });
    expect(wahooClient.createWorkout).toHaveBeenCalledTimes(1);
    expect(findWorkoutByToken).toHaveBeenCalledTimes(2);
  });

  it("recovers a committed Wahoo planned-activity resource after local link persistence fails without a second POST", async () => {
    const committedWorkout = remoteWorkout();
    const createEventResourceLink = vi
      .fn()
      .mockRejectedValueOnce(new Error("integration_generation_inactive"))
      .mockResolvedValueOnce(undefined);
    const findWorkoutByToken = vi
      .fn()
      .mockResolvedValueOnce({ complete: true, workout: null })
      .mockResolvedValueOnce({ complete: true, workout: committedWorkout });
    const fixture = syncFixture({
      repository: { createEventResourceLink },
      wahooClient: { findWorkoutByToken },
    });

    await expect(
      fixture.service.syncEvent("event-1", "profile-1", fixture.execution),
    ).resolves.toMatchObject({ retryable: true, success: false });
    await expect(
      fixture.service.syncEvent("event-1", "profile-1", fixture.execution),
    ).resolves.toMatchObject({ success: true });

    expect(fixture.wahooClient.createWorkout).toHaveBeenCalledTimes(1);
    expect(createEventResourceLink).toHaveBeenCalledTimes(2);
  });

  it("verifies an ambiguous PUT before treating it as successful", async () => {
    const existing = remoteWorkout({ name: "Old name", plan_id: 1 });
    const updateWorkout = vi.fn().mockRejectedValue(new Error("socket closed"));
    const { execution, service, wahooClient } = syncFixture({
      wahooClient: {
        findWorkoutByToken: vi.fn().mockResolvedValue({ complete: true, workout: existing }),
        getWorkout: vi.fn().mockResolvedValue(remoteWorkout()),
        updateWorkout,
      },
    });

    await expect(service.syncEvent("event-1", "profile-1", execution)).resolves.toMatchObject({
      success: true,
    });
    expect(updateWorkout).toHaveBeenCalledTimes(1);
    expect(wahooClient.getWorkout).toHaveBeenCalledWith("99", execution.signal);
  });

  it("deletes an unreferenced prior Wahoo plan after replacing the planned activity projection", async () => {
    const { execution, repository, service, wahooClient } = syncFixture({
      existingLink: {
        externalId: "99",
        id: "link-1",
        providerMetadata: {
          wahoo: { planId: 41, providerAccountExternalId: "wahoo-user-1" },
        },
        updatedAt: null,
      },
    });

    await expect(service.syncEvent("event-1", "profile-1", execution)).resolves.toMatchObject({
      success: true,
    });
    expect(repository.isWahooPlanReferencedByOtherEvent).toHaveBeenCalledWith({
      excludeLinkId: "link-1",
      integrationId: "integration-1",
      planId: 41,
      profileId: "profile-1",
    });
    expect(wahooClient.deletePlan).toHaveBeenCalledWith(41, execution.signal);
  });

  it("retains a prior Wahoo plan while another event still references it", async () => {
    const { execution, service, wahooClient } = syncFixture({
      existingLink: {
        externalId: "99",
        id: "link-1",
        providerMetadata: {
          wahoo: { planId: 41, providerAccountExternalId: "wahoo-user-1" },
        },
        updatedAt: null,
      },
      repository: { isWahooPlanReferencedByOtherEvent: vi.fn().mockResolvedValue(true) },
    });

    await expect(service.syncEvent("event-1", "profile-1", execution)).resolves.toMatchObject({
      success: true,
    });
    expect(wahooClient.deletePlan).not.toHaveBeenCalled();
  });

  it("rejects route-linked activity before credentials or provider effects", async () => {
    const { execution, repository, service, wahooClient } = syncFixture({ routeId: "route-1" });

    await expect(service.syncEvent("event-1", "profile-1", execution)).resolves.toMatchObject({
      failureCategory: "eligibility",
      success: false,
    });
    expect(repository.findWahooIntegrationByProfileId).not.toHaveBeenCalled();
    expect(wahooClient.getPlans).not.toHaveBeenCalled();
  });

  it("removes a stale planned activity when a queued publish races with route attachment", async () => {
    const { execution, repository, service, wahooClient } = syncFixture({
      existingLink: { externalId: "99", id: "link-1", updatedAt: null },
      routeId: "route-1",
    });

    await expect(service.syncEvent("event-1", "profile-1", execution)).resolves.toMatchObject({
      success: true,
    });
    expect(wahooClient.deleteWorkout).toHaveBeenCalledWith("99", execution.signal);
    expect(repository.deleteEventResourceLink).toHaveBeenCalledWith({
      expectedIntegrationGeneration: 3,
      id: "link-1",
      integrationId: "integration-1",
      profileId: "profile-1",
    });
  });

  it("removes a stale planned activity when the edited plan becomes unsupported", async () => {
    const unsupported = core.SYSTEM_TEMPLATES.find(
      (template) => core.compileActivityPlanV3(template.structure).activity_category === "strength",
    );
    if (!unsupported) throw new Error("Expected a strength system template fixture");
    const { execution, repository, service, wahooClient } = syncFixture({
      existingLink: { externalId: "99", id: "link-1", updatedAt: null },
      planStructure: unsupported.structure,
    });

    await expect(service.syncEvent("event-1", "profile-1", execution)).resolves.toMatchObject({
      success: true,
    });
    expect(wahooClient.deleteWorkout).toHaveBeenCalledWith("99", execution.signal);
    expect(repository.deleteEventResourceLink).toHaveBeenCalledWith({
      expectedIntegrationGeneration: 3,
      id: "link-1",
      integrationId: "integration-1",
      profileId: "profile-1",
    });
    expect(wahooClient.createPlan).not.toHaveBeenCalled();
  });

  it("confirms an ambiguous delete with GET 404 before removing the local link", async () => {
    const deleteEventResourceLink = vi.fn().mockResolvedValue(undefined);
    const { execution, service, wahooClient } = syncFixture({
      existingLink: { externalId: "99", id: "link-1", updatedAt: null },
      repository: { deleteEventResourceLink },
      wahooClient: {
        deleteWorkout: vi.fn().mockRejectedValue(new Error("socket closed")),
        getWorkout: vi
          .fn()
          .mockRejectedValue(Object.assign(new Error("not found"), { status: 404 })),
      },
    });

    await expect(
      service.unsyncEvent("event-1", "profile-1", undefined, execution),
    ).resolves.toMatchObject({ success: true });
    expect(wahooClient.getWorkout).toHaveBeenCalledWith("99", execution.signal);
    expect(deleteEventResourceLink).toHaveBeenCalledWith({
      expectedIntegrationGeneration: 3,
      id: "link-1",
      integrationId: "integration-1",
      profileId: "profile-1",
    });
  });

  it("deletes an unreferenced Wahoo plan before removing the final event link", async () => {
    const { execution, repository, service, wahooClient } = syncFixture({
      existingLink: {
        externalId: "99",
        id: "link-1",
        providerMetadata: {
          wahoo: { planId: 42, providerAccountExternalId: "wahoo-user-1" },
        },
        updatedAt: null,
      },
    });

    await expect(
      service.unsyncEvent("event-1", "profile-1", undefined, execution),
    ).resolves.toMatchObject({ success: true });
    expect(repository.isWahooPlanReferencedByOtherEvent).toHaveBeenCalledWith({
      excludeLinkId: "link-1",
      integrationId: "integration-1",
      planId: 42,
      profileId: "profile-1",
    });
    expect(wahooClient.deletePlan).toHaveBeenCalledWith(42, execution.signal);
    expect(wahooClient.deletePlan.mock.invocationCallOrder[0]).toBeLessThan(
      repository.deleteEventResourceLink.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("retains the local link when an ambiguous delete still exists remotely", async () => {
    const deleteEventResourceLink = vi.fn();
    const { execution, service } = syncFixture({
      existingLink: { externalId: "99", id: "link-1", updatedAt: null },
      repository: { deleteEventResourceLink },
      wahooClient: {
        deleteWorkout: vi.fn().mockRejectedValue(new Error("socket closed")),
        getWorkout: vi.fn().mockResolvedValue(remoteWorkout()),
      },
    });

    await expect(
      service.unsyncEvent("event-1", "profile-1", undefined, execution),
    ).resolves.toMatchObject({ retryable: true, success: false });
    expect(deleteEventResourceLink).not.toHaveBeenCalled();
  });

  it("stops before provider deletion when durable integration authority changed", async () => {
    const { execution, repository, service, wahooClient } = syncFixture({
      existingLink: { externalId: "99", id: "link-1", updatedAt: null },
      repository: {
        findWahooIntegrationByIdAndGeneration: vi.fn().mockResolvedValue(null),
      },
    });

    await expect(
      service.unsyncEvent("event-1", "profile-1", undefined, execution),
    ).resolves.toMatchObject({
      action: "no_change",
      success: true,
      terminalOutcome: "superseded",
    });
    expect(repository.findWahooIntegrationByIdAndGeneration).toHaveBeenCalledWith({
      integrationGeneration: 3,
      integrationId: "integration-1",
    });
    expect(wahooClient.deleteWorkout).not.toHaveBeenCalled();
    expect(repository.deleteEventResourceLink).not.toHaveBeenCalled();
  });

  it("does not delete a linked Wahoo planned-activity resource through a different Wahoo account", async () => {
    const { execution, repository, service, wahooClient } = syncFixture({
      existingLink: {
        externalId: "99",
        id: "link-1",
        providerMetadata: {
          wahoo: { providerAccountExternalId: "different-wahoo-user" },
        },
        updatedAt: null,
      },
    });

    await expect(
      service.unsyncEvent("event-1", "profile-1", undefined, execution),
    ).resolves.toMatchObject({
      failureCode: "provider_account_mismatch",
      retryable: false,
      success: false,
    });
    expect(wahooClient.deleteWorkout).not.toHaveBeenCalled();
    expect(repository.deleteEventResourceLink).not.toHaveBeenCalled();
  });
});

describe("WahooSyncService owned-route mirroring", () => {
  const routeExecution = {
    expectedIntegrationGeneration: 3,
    expectedRouteUpdatedAt: "2026-07-28T10:00:00.000Z",
    integrationId: "integration-1",
    signal: new AbortController().signal,
  };

  it("creates one FIT route after a complete external-id lookup and binds the local link", async () => {
    const { repository, service, wahooClient } = syncFixture();

    await expect(
      service.syncOwnedRoute("route-1", "profile-1", "gradientpeak:route:route-1", routeExecution),
    ).resolves.toMatchObject({ action: "created", routeId: "77", success: true });

    expect(wahooClient.getRoutes).toHaveBeenCalledWith(
      "gradientpeak:route:route-1",
      routeExecution.signal,
    );
    expect(wahooClient.createRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: "gradientpeak:route:route-1",
        file: expect.stringMatching(/^data:application\/vnd\.fit;base64,/),
        filename: "Ridge Loop.fit",
        name: "Ridge Loop",
        workoutTypeFamilyId: 255,
      }),
      routeExecution.signal,
    );
    expect(wahooClient.updateRoute).not.toHaveBeenCalled();
    expect(repository.createRouteResourceLink).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: "77",
        integrationId: "integration-1",
        payloadHash: expect.any(String),
        profileId: "profile-1",
        providerMetadata: {
          wahoo: { providerAccountExternalId: "wahoo-user-1" },
        },
        routeId: "route-1",
      }),
    );
  });

  it("updates a reconciled Wahoo route instead of creating a duplicate", async () => {
    const route = remoteRoute({ provider_updated_at: "2026-07-27T10:00:00.000Z" });
    const { repository, service, wahooClient } = syncFixture({
      repository: {
        getOwnedRouteForMirror: vi.fn().mockResolvedValue({
          description: null,
          filePath: "profile-1/route-1.gpx",
          id: "route-1",
          name: "Ridge Loop",
          totalAscent: 20,
          totalDescent: 18,
          totalDistance: 1000,
          updatedAt: "2026-07-28T10:00:00.000Z",
        }),
        getRouteResourceLink: vi.fn().mockResolvedValue({
          externalId: "77",
          id: "link-1",
          integrationId: "integration-1",
          payloadHash: "old",
          providerMetadata: {
            wahoo: { providerAccountExternalId: "wahoo-user-1" },
          },
          providerUpdatedAt: "2026-07-27T10:00:00.000Z",
          updatedAt: "2026-07-27T10:00:00.000Z",
        }),
      },
      wahooClient: {
        getRoutes: vi.fn().mockResolvedValue([route]),
        updateRoute: vi.fn().mockResolvedValue(remoteRoute()),
      },
    });

    await expect(
      service.syncOwnedRoute("route-1", "profile-1", "gradientpeak:route:route-1", routeExecution),
    ).resolves.toMatchObject({ action: "updated", success: true });
    expect(wahooClient.createRoute).not.toHaveBeenCalled();
    expect(wahooClient.updateRoute).toHaveBeenCalledWith(
      "77",
      expect.objectContaining({
        description: null,
        providerUpdatedAt: "2026-07-28T10:00:00.000Z",
      }),
      routeExecution.signal,
    );
    expect(repository.updateRouteResourceLink).toHaveBeenCalledWith(
      expect.objectContaining({ id: "link-1", externalId: "77" }),
    );
  });

  it("dead-letters an ambiguous create rather than blindly posting twice", async () => {
    const getRoutes = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const { service, wahooClient } = syncFixture({
      wahooClient: {
        createRoute: vi.fn().mockRejectedValue(new Error("socket closed")),
        getRoutes,
      },
    });

    await expect(
      service.syncOwnedRoute("route-1", "profile-1", "gradientpeak:route:route-1", routeExecution),
    ).resolves.toMatchObject({
      failureCode: "ambiguous_create",
      retryable: false,
      success: false,
    });
    expect(wahooClient.createRoute).toHaveBeenCalledTimes(1);
    expect(getRoutes).toHaveBeenCalledTimes(2);
  });

  it("dead-letters an uncertain create when the reconciliation read also fails", async () => {
    const getRoutes = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("lookup unavailable"));
    const { service, wahooClient } = syncFixture({
      wahooClient: {
        createRoute: vi.fn().mockRejectedValue(new Error("socket closed")),
        getRoutes,
      },
    });

    await expect(
      service.syncOwnedRoute("route-1", "profile-1", "gradientpeak:route:route-1", routeExecution),
    ).resolves.toMatchObject({
      failureCode: "ambiguous_create",
      retryable: false,
      success: false,
    });
    expect(wahooClient.createRoute).toHaveBeenCalledTimes(1);
    expect(getRoutes).toHaveBeenCalledTimes(2);
  });

  it("reconciles a mismatched create response by exact identity before binding the link", async () => {
    const exactRoute = remoteRoute();
    const getRoutes = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([exactRoute]);
    const { repository, service, wahooClient } = syncFixture({
      wahooClient: {
        createRoute: vi.fn().mockResolvedValue(
          remoteRoute({
            external_id: "unexpected-provider-identity",
            id: 999,
          }),
        ),
        getRoutes,
        updateRoute: vi.fn().mockResolvedValue(exactRoute),
      },
    });

    await expect(
      service.syncOwnedRoute("route-1", "profile-1", "gradientpeak:route:route-1", routeExecution),
    ).resolves.toMatchObject({ action: "updated", routeId: "77", success: true });

    expect(getRoutes).toHaveBeenCalledTimes(2);
    expect(wahooClient.updateRoute).toHaveBeenCalledWith(
      "77",
      expect.objectContaining({ externalId: "gradientpeak:route:route-1" }),
      routeExecution.signal,
    );
    expect(repository.createRouteResourceLink).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: "77", routeId: "route-1" }),
    );
  });

  it("fails closed when a mismatched update response has no exact-identity route", async () => {
    const currentRoute = remoteRoute({ provider_updated_at: "2026-07-27T10:00:00.000Z" });
    const getRoutes = vi.fn().mockResolvedValueOnce([currentRoute]).mockResolvedValueOnce([]);
    const { repository, service } = syncFixture({
      repository: {
        getRouteResourceLink: vi.fn().mockResolvedValue({
          externalId: "77",
          id: "link-1",
          integrationId: "integration-1",
          payloadHash: "old",
          providerMetadata: {
            wahoo: { providerAccountExternalId: "wahoo-user-1" },
          },
          providerUpdatedAt: "2026-07-27T10:00:00.000Z",
          updatedAt: "2026-07-27T10:00:00.000Z",
        }),
      },
      wahooClient: {
        getRoutes,
        updateRoute: vi
          .fn()
          .mockResolvedValue(remoteRoute({ external_id: "unexpected-provider-identity", id: 999 })),
      },
    });

    await expect(
      service.syncOwnedRoute("route-1", "profile-1", "gradientpeak:route:route-1", routeExecution),
    ).resolves.toMatchObject({
      failureCode: "ambiguous_create",
      retryable: false,
      success: false,
    });
    expect(repository.updateRouteResourceLink).not.toHaveBeenCalled();
  });

  it("retries safely when an exact route disappears during update", async () => {
    const notFound = Object.assign(new Error("route not found"), { status: 404 });
    const { repository, service, wahooClient } = syncFixture({
      wahooClient: {
        getRoutes: vi
          .fn()
          .mockResolvedValue([remoteRoute({ provider_updated_at: "2026-07-27T10:00:00.000Z" })]),
        updateRoute: vi.fn().mockRejectedValue(notFound),
      },
    });

    await expect(
      service.syncOwnedRoute("route-1", "profile-1", "gradientpeak:route:route-1", routeExecution),
    ).resolves.toMatchObject({
      failureCode: "provider_failure",
      retryable: true,
      success: false,
    });

    expect(wahooClient.createRoute).not.toHaveBeenCalled();
    expect(repository.createRouteResourceLink).not.toHaveBeenCalled();
    expect(repository.updateRouteResourceLink).not.toHaveBeenCalled();
  });

  it("stops a superseded route update before credentials or provider effects", async () => {
    const { repository, service, wahooClient } = syncFixture();

    await expect(
      service.syncOwnedRoute("route-1", "profile-1", "gradientpeak:route:route-1", {
        ...routeExecution,
        expectedRouteUpdatedAt: "2026-07-27T10:00:00.000Z",
      }),
    ).resolves.toMatchObject({ success: true, terminalOutcome: "superseded" });

    expect(repository.findWahooIntegrationByProfileId).not.toHaveBeenCalled();
    expect(wahooClient.getRoutes).not.toHaveBeenCalled();
    expect(wahooClient.createRoute).not.toHaveBeenCalled();
  });

  it("does not update a route link through a different Wahoo account", async () => {
    const { repository, service, wahooClient } = syncFixture({
      repository: {
        getRouteResourceLink: vi.fn().mockResolvedValue({
          externalId: "77",
          id: "link-1",
          integrationId: "integration-1",
          payloadHash: "hash",
          providerMetadata: {
            wahoo: { providerAccountExternalId: "different-wahoo-user" },
          },
          providerUpdatedAt: "2026-07-28T10:00:00.000Z",
          updatedAt: "2026-07-28T10:00:00.000Z",
        }),
      },
    });

    await expect(
      service.syncOwnedRoute("route-1", "profile-1", "gradientpeak:route:route-1", routeExecution),
    ).resolves.toMatchObject({
      failureCode: "provider_account_mismatch",
      retryable: false,
      success: false,
    });

    expect(wahooClient.getRoutes).not.toHaveBeenCalled();
    expect(repository.updateRouteResourceLink).not.toHaveBeenCalled();
  });

  it("requires route-library grants before creating provider resources", async () => {
    const { service, wahooClient } = syncFixture({
      repository: {
        findWahooIntegrationByProfileId: vi
          .fn()
          .mockResolvedValue({ ...integration, scope: "workouts_read offline_data" }),
      },
    });

    await expect(
      service.syncOwnedRoute("route-1", "profile-1", "gradientpeak:route:route-1", routeExecution),
    ).resolves.toMatchObject({
      failureCode: "reconnect_required",
      retryable: false,
      success: false,
    });

    expect(wahooClient.getRoutes).not.toHaveBeenCalled();
    expect(wahooClient.createRoute).not.toHaveBeenCalled();
  });

  it("verifies an uncertain route deletion before removing the local link", async () => {
    const getRoutes = vi.fn().mockResolvedValueOnce([remoteRoute()]).mockResolvedValueOnce([]);
    const { repository, service, wahooClient } = syncFixture({
      repository: {
        getRouteResourceLink: vi.fn().mockResolvedValue({
          externalId: "77",
          id: "link-1",
          integrationId: "integration-1",
          payloadHash: "hash",
          providerMetadata: {
            wahoo: { providerAccountExternalId: "wahoo-user-1" },
          },
          providerUpdatedAt: "2026-07-28T10:00:00.000Z",
          updatedAt: "2026-07-28T10:00:00.000Z",
        }),
      },
      wahooClient: {
        deleteRoute: vi.fn().mockRejectedValue(new Error("socket closed")),
        getRoutes,
      },
    });

    await expect(
      service.unsyncOwnedRoute(
        "route-1",
        "profile-1",
        "gradientpeak:route:route-1",
        routeExecution,
      ),
    ).resolves.toMatchObject({ success: true });
    expect(wahooClient.deleteRoute).toHaveBeenCalledTimes(1);
    expect(repository.deleteRouteResourceLink).toHaveBeenCalledWith({
      expectedIntegrationGeneration: 3,
      id: "link-1",
      integrationId: "integration-1",
      profileId: "profile-1",
    });
  });
});
