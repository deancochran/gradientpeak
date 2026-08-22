import { describe, expect, it } from "vitest";
import { eventsRouter } from "../events";
import { routesRouter } from "../routes";

const ROUTE_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";

function unauthenticatedRoutesCaller() {
  return routesRouter.createCaller({
    db: undefined,
    session: null,
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as never);
}

function unauthenticatedEventsCaller() {
  return eventsRouter.createCaller({
    db: undefined,
    session: null,
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as never);
}

describe("route capability API boundaries", () => {
  it.each([
    ["browse-and-inspect list", () => unauthenticatedRoutesCaller().list({})],
    ["browse-and-inspect detail", () => unauthenticatedRoutesCaller().get({ id: ROUTE_ID })],
    [
      "upload",
      () =>
        unauthenticatedRoutesCaller().upload({
          idempotencyKey: ROUTE_ID,
          name: "Boundary route",
          description: null,
          fileContent: "<gpx />",
          fileName: "route.gpx",
        }),
    ],
    [
      "edit-metadata",
      () => unauthenticatedRoutesCaller().update({ id: ROUTE_ID, name: "Updated route" }),
    ],
    [
      "attach-to-calendar-event",
      () =>
        unauthenticatedEventsCaller().update({
          id: EVENT_ID,
          patch: { route_id: ROUTE_ID },
        }),
    ],
  ] as const)("rejects unauthenticated %s access", async (_capability, call) => {
    await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
