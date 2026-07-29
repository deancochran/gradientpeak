import { describe, expect, it, vi } from "vitest";
import {
  enqueueWahooGroupEventRouteDeliveryForIntegration,
  enqueueWahooGroupEventRouteDeliveryReconcile,
  getWahooGroupEventRouteDeliveryExternalId,
  reconcileWahooGroupEventRouteDeliveries,
  resolveCancelledGroupEventRouteDeliveries,
  WAHOO_GROUP_EVENT_ROUTE_DELIVERY_RECONCILE_PAGE_SIZE,
} from "./wahoo-group-event-route-delivery";

describe("Wahoo group-event route delivery enqueue", () => {
  it("uses a recipient-specific deterministic identity and event lane", async () => {
    const enqueueJob = vi.fn().mockResolvedValue({ id: "job-1", status: "queued" });
    await expect(
      enqueueWahooGroupEventRouteDeliveryForIntegration({
        eventId: "event-1",
        expectedEventUpdatedAt: "2026-07-29T12:00:00.000Z",
        expectedRouteUpdatedAt: "2026-07-29T12:01:00.000Z",
        integrationGeneration: 3,
        integrationId: "integration-1",
        profileId: "recipient-1",
        providerSyncRepository: { enqueueJob } as never,
        sourceRouteId: "route-1",
      }),
    ).resolves.toEqual({ jobId: "job-1", queued: true });

    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: "wahoo:deliver_group_event_route:integration-1:event-1:route-1",
        internalResourceId: "event-1",
        jobType: "wahoo.deliver_group_event_route",
        payload: {
          eventId: "event-1",
          expectedEventUpdatedAt: "2026-07-29T12:00:00.000Z",
          expectedRouteUpdatedAt: "2026-07-29T12:01:00.000Z",
          externalId: getWahooGroupEventRouteDeliveryExternalId({
            eventId: "event-1",
            profileId: "recipient-1",
            sourceRouteId: "route-1",
          }),
          sourceRouteId: "route-1",
        },
        priority: 50,
        resourceKind: "group_event_route_delivery",
        syncLaneKey: "wahoo:integration-1:group_event_route_delivery:event-1",
      }),
    );
    expect(
      getWahooGroupEventRouteDeliveryExternalId({
        eventId: "event-1",
        profileId: "recipient-1",
        sourceRouteId: "route-1",
      }),
    ).not.toContain("recipient-1");
    expect(
      getWahooGroupEventRouteDeliveryExternalId({
        eventId: "event-1",
        profileId: "recipient-1",
        sourceRouteId: "route-1",
      }),
    ).not.toMatch(/event-1|route-1/);
  });

  it("uses the supplied transaction for reconciliation enqueueing", async () => {
    const enqueueJobInTransaction = vi.fn().mockResolvedValue({ id: "job-1", status: "queued" });
    const transaction = {};
    await enqueueWahooGroupEventRouteDeliveryReconcile({
      integrationGeneration: 3,
      integrationId: "integration-1",
      profileId: "recipient-1",
      providerSyncRepository: { enqueueJobInTransaction } as never,
      transaction: transaction as never,
      trigger: "preference_changed",
    });
    expect(enqueueJobInTransaction).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        jobType: "wahoo.reconcile_group_event_route_deliveries",
        payload: { trigger: "preference_changed" },
      }),
    );
  });

  it("resolves inherited and overridden routes for every cancelled series occurrence", () => {
    expect(
      resolveCancelledGroupEventRouteDeliveries(
        [
          { eventId: "series-1", routeId: "route-series", seriesId: null },
          { eventId: "occurrence-1", routeId: null, seriesId: "series-1" },
          { eventId: "occurrence-2", routeId: "route-override", seriesId: "series-1" },
          { eventId: "unrouted", routeId: null, seriesId: null },
        ],
        "route-series",
      ),
    ).toEqual([
      { eventId: "series-1", sourceRouteId: "route-series" },
      { eventId: "occurrence-1", sourceRouteId: "route-series" },
      { eventId: "occurrence-2", sourceRouteId: "route-override" },
    ]);
  });

  it("reconciles no more than one bounded eligible-delivery page", async () => {
    const enqueueJob = vi.fn().mockResolvedValue({ id: "job-1", status: "queued" });
    const listEligibleGroupEventRouteDeliveries = vi.fn().mockResolvedValue([
      {
        eventId: "event-1",
        eventUpdatedAt: "2026-07-29T12:00:00.000Z",
        routeUpdatedAt: "2026-07-29T12:01:00.000Z",
        sourceRouteId: "route-1",
        startsAt: "2026-07-30T12:00:00.000Z",
      },
    ]);
    const listGroupEventRouteDeliveryResourceLinks = vi.fn().mockResolvedValue([]);

    await expect(
      reconcileWahooGroupEventRouteDeliveries({
        integrationGeneration: 3,
        integrationId: "integration-1",
        profileId: "recipient-1",
        providerSyncRepository: { enqueueJob } as never,
        wahooRepository: {
          listEligibleGroupEventRouteDeliveries,
          listGroupEventRouteDeliveryResourceLinks,
        } as never,
      }),
    ).resolves.toBe(1);
    expect(listEligibleGroupEventRouteDeliveries).toHaveBeenCalledWith({
      limit: WAHOO_GROUP_EVENT_ROUTE_DELIVERY_RECONCILE_PAGE_SIZE,
      profileId: "recipient-1",
    });
    expect(enqueueJob).toHaveBeenCalledTimes(1);
  });

  it("continues reconciliation after a full page", async () => {
    const firstPage = Array.from(
      { length: WAHOO_GROUP_EVENT_ROUTE_DELIVERY_RECONCILE_PAGE_SIZE },
      (_, index) => ({
        eventId: `event-${String(index).padStart(3, "0")}`,
        eventUpdatedAt: "2026-07-29T12:00:00.000Z",
        routeUpdatedAt: "2026-07-29T12:01:00.000Z",
        sourceRouteId: `route-${index}`,
        startsAt: `2026-08-${String(Math.floor(index / 4) + 1).padStart(2, "0")}T${String((index % 4) + 10).padStart(2, "0")}:00:00.000Z`,
      }),
    );
    const last = firstPage.at(-1);
    if (!last) throw new Error("Expected a full reconciliation page");
    const listEligibleGroupEventRouteDeliveries = vi
      .fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([]);
    const listGroupEventRouteDeliveryResourceLinks = vi.fn().mockResolvedValue([]);
    const enqueueJob = vi.fn().mockResolvedValue({ id: "job-1", status: "queued" });

    await expect(
      reconcileWahooGroupEventRouteDeliveries({
        integrationGeneration: 3,
        integrationId: "integration-1",
        profileId: "recipient-1",
        providerSyncRepository: { enqueueJob } as never,
        wahooRepository: {
          listEligibleGroupEventRouteDeliveries,
          listGroupEventRouteDeliveryResourceLinks,
        } as never,
      }),
    ).resolves.toBe(WAHOO_GROUP_EVENT_ROUTE_DELIVERY_RECONCILE_PAGE_SIZE);
    expect(listEligibleGroupEventRouteDeliveries).toHaveBeenNthCalledWith(2, {
      after: { eventId: last.eventId, startsAt: last.startsAt },
      limit: WAHOO_GROUP_EVENT_ROUTE_DELIVERY_RECONCILE_PAGE_SIZE,
      profileId: "recipient-1",
    });
  });

  it("re-enqueues existing deliveries so revoked access converges to deletion", async () => {
    const enqueueJob = vi.fn().mockResolvedValue({ id: "job-1", status: "queued" });
    const listEligibleGroupEventRouteDeliveries = vi.fn().mockResolvedValue([]);
    const listGroupEventRouteDeliveryResourceLinks = vi
      .fn()
      .mockResolvedValue([{ eventId: "event-1", sourceRouteId: "route-1" }]);

    await expect(
      reconcileWahooGroupEventRouteDeliveries({
        integrationGeneration: 3,
        integrationId: "integration-1",
        profileId: "recipient-1",
        providerSyncRepository: { enqueueJob } as never,
        wahooRepository: {
          listEligibleGroupEventRouteDeliveries,
          listGroupEventRouteDeliveryResourceLinks,
        } as never,
      }),
    ).resolves.toBe(1);
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        internalResourceId: "event-1",
        payload: expect.objectContaining({ eventId: "event-1", sourceRouteId: "route-1" }),
      }),
    );
  });
});
