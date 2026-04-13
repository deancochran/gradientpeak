import { buildCurrentRouteKey, buildHrefKey } from "../route-dedupe";

describe("route dedupe helpers", () => {
  it("normalizes href strings with sorted query params", () => {
    expect(buildHrefKey("/event-detail?mode=edit&id=event-1")).toBe(
      "/event-detail?id=event-1&mode=edit",
    );
  });

  it("resolves dynamic object hrefs into comparable route keys", () => {
    expect(
      buildHrefKey({
        pathname: "/user/[userId]",
        params: { tab: "plans", userId: "user-1" },
      }),
    ).toBe("/user/user-1?tab=plans");
  });

  it("filters path params out of the current route key", () => {
    expect(
      buildCurrentRouteKey("/user/user-1", {
        tab: "plans",
        userId: "user-1",
      }),
    ).toBe("/user/user-1?tab=plans");
  });
});
