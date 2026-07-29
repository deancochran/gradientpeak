import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueJob: vi.fn(),
  enqueueJobInTransaction: vi.fn(),
  findWahooIntegrationByProfileId: vi.fn(),
  getOwnedRouteForMirror: vi.fn(),
  getRouteResourceLink: vi.fn(),
}));

vi.mock("../../../infrastructure/repositories", () => ({
  createProviderSyncRepository: vi.fn(() => ({
    enqueueJob: mocks.enqueueJob,
    enqueueJobInTransaction: mocks.enqueueJobInTransaction,
  })),
  createWahooRepository: vi.fn(() => ({
    findWahooIntegrationByProfileId: mocks.findWahooIntegrationByProfileId,
    getOwnedRouteForMirror: mocks.getOwnedRouteForMirror,
    getRouteResourceLink: mocks.getRouteResourceLink,
  })),
}));

import {
  enqueueWahooOwnedRouteMirror,
  enqueueWahooOwnedRouteReconcile,
  getWahooOwnedRouteExternalId,
} from "./wahoo-owned-route-mirror";

describe("Wahoo owned-route mirror enqueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findWahooIntegrationByProfileId.mockResolvedValue({
      externalId: "wahoo-user-1",
      id: "integration-1",
      integrationGeneration: 4,
      scope: "routes_read routes_write offline_data",
    });
    mocks.getOwnedRouteForMirror.mockResolvedValue({
      id: "route-1",
      updatedAt: "2026-07-29T12:00:00.000Z",
    });
    mocks.getRouteResourceLink.mockResolvedValue(null);
    mocks.enqueueJob.mockResolvedValue({ id: "job-1", status: "queued" });
    mocks.enqueueJobInTransaction.mockResolvedValue({ id: "job-1", status: "queued" });
  });

  it("uses an opaque provider-visible route identity", () => {
    expect(getWahooOwnedRouteExternalId("internal-route-1")).not.toContain("internal-route-1");
  });

  it("enqueues a generation-fenced route upsert in a stable route lane", async () => {
    await expect(
      enqueueWahooOwnedRouteMirror({
        db: {} as never,
        operation: "upsert",
        profileId: "profile-1",
        routeId: "route-1",
      }),
    ).resolves.toEqual({ jobId: "job-1", queued: true });

    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationGeneration: 4,
        integrationId: "integration-1",
        jobType: "wahoo.upsert_owned_route",
        payload: {
          expectedRouteUpdatedAt: "2026-07-29T12:00:00.000Z",
          externalId: getWahooOwnedRouteExternalId("route-1"),
          operation: "upsert",
          routeId: "route-1",
        },
        resourceKind: "activity_route",
        syncLaneKey: "wahoo:integration-1:owned_route:route-1",
      }),
    );
  });

  it("enqueues delete reconciliation even when no local resource link exists", async () => {
    await enqueueWahooOwnedRouteMirror({
      db: {} as never,
      operation: "delete",
      profileId: "profile-1",
      routeId: "route-1",
    });

    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: "wahoo.delete_owned_route",
        payload: {
          externalId: getWahooOwnedRouteExternalId("route-1"),
          operation: "delete",
          routeId: "route-1",
        },
      }),
    );
  });

  it("blocks local deletion when a mirrored link cannot be cleaned up", async () => {
    mocks.findWahooIntegrationByProfileId.mockResolvedValue(null);
    mocks.getRouteResourceLink.mockResolvedValue({ id: "link-1" });

    await expect(
      enqueueWahooOwnedRouteMirror({
        db: {} as never,
        operation: "delete",
        profileId: "profile-1",
        routeId: "route-1",
      }),
    ).rejects.toThrow("Reconnect Wahoo");
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  it("queues one reconciliation job on connect or manual repair", async () => {
    const providerSyncRepository = {
      enqueueJob: mocks.enqueueJob,
      enqueueJobInTransaction: mocks.enqueueJobInTransaction,
    };
    const transaction = { id: "tx-1" };

    await enqueueWahooOwnedRouteReconcile({
      integrationGeneration: 4,
      integrationId: "integration-1",
      profileId: "profile-1",
      providerSyncRepository: providerSyncRepository as never,
      transaction: transaction as never,
      trigger: "connect",
    });

    expect(mocks.enqueueJobInTransaction).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        jobType: "wahoo.reconcile_owned_routes",
        payload: { trigger: "connect" },
      }),
    );
  });
});
