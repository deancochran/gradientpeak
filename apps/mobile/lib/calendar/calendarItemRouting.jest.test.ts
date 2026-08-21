import { buildCalendarItemRoute } from "./calendarItemRouting";

jest.mock("./eventRouting", () => ({
  __esModule: true,
  buildOpenEventRoute: ({ id }: { id: string }) => `/event-detail?id=${id}`,
}));

function item(kind: string, id: string) {
  return { kind, id, event: { type: "custom" } } as never;
}

describe("buildCalendarItemRoute", () => {
  it.each([
    ["completed_activity", "activity-1", "/activity-detail?id=activity-1"],
    ["goal", "goal-1", { pathname: "/goal-detail", params: { id: "goal-1" } }],
    [
      "group_event",
      "group-1",
      { pathname: "/group-event-detail", params: { groupEventId: "group-1" } },
    ],
    ["event", "event-1", "/event-detail?id=event-1"],
  ])("routes %s items consistently", (kind, id, expected) => {
    expect(buildCalendarItemRoute(item(kind, id))).toEqual(expected);
  });
});
