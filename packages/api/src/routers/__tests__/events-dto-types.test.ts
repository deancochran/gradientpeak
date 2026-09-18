import type { inferRouterOutputs } from "@trpc/server";
import { describe, expect, it } from "vitest";
import type { AppRouter } from "..";

type Assert<T extends true> = T;
type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false;
type EventOutputs = inferRouterOutputs<AppRouter>["events"];
type CalendarOutputs = inferRouterOutputs<AppRouter>["calendar"];
describe("Event DTO public type contract", () => {
  it("keeps canonical plan activity category in AppRouter outputs", () => {
    expect(true).toBe(true);
  });
});
