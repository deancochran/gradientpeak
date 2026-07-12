import { ROUTES } from "@/lib/constants/routes";

describe("goals list route", () => {
  it("uses the flat goals-list route", () => {
    expect(ROUTES.GOALS.LIST).toBe("/goals-list");
  });
});
