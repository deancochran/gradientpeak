import { buildOpenEventRoute } from "@/lib/calendar/eventRouting";

describe("calendar.create-event, calendar.edit-event, calendar.delete-event", () => {
  it("routes a persisted event by its stable id rather than a display label", () => {
    expect(buildOpenEventRoute({ id: "event-42", event_type: "custom" })).toBe(
      "/event-detail?id=event-42",
    );
  });
});
