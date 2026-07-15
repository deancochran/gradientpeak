// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordSubmitRedirect, validateRecordSubmitSearch } from "./submit";

const mocks = vi.hoisted(() => ({
  navigateProps: undefined as Record<string, unknown> | undefined,
  search: { activityType: "run", category: "run", gps: "on" } as {
    activityType: "run" | "bike" | "swim" | "strength" | "other";
    category: "run" | "bike" | "swim" | "strength" | "other";
    eventId?: string;
    gps: "on" | "off";
    routeId?: string;
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useSearch: () => mocks.search,
  }),
  Navigate: (props: Record<string, unknown>) => {
    mocks.navigateProps = props;
    return null;
  },
}));

afterEach(() => {
  cleanup();
  mocks.navigateProps = undefined;
});

describe("record submit redirect adapter", () => {
  it("accepts both activityType and legacy category search", () => {
    expect(validateRecordSubmitSearch({ category: "bike" })).toEqual({
      activityType: "bike",
      category: "bike",
      eventId: undefined,
      gps: "on",
      routeId: undefined,
    });
    expect(validateRecordSubmitSearch({ activityType: "swim", category: "run" })).toEqual({
      activityType: "swim",
      category: "swim",
      eventId: undefined,
      gps: "off",
      routeId: undefined,
    });
    expect(validateRecordSubmitSearch({ activityType: "unsupported" })).toEqual({
      activityType: "run",
      category: "run",
      eventId: undefined,
      gps: "on",
      routeId: undefined,
    });
  });

  it("preserves the complete validated launcher search through the redirect", () => {
    const eventId = "11111111-1111-4111-8111-111111111111";
    const routeId = "22222222-2222-4222-8222-222222222222";
    mocks.search = {
      activityType: "strength",
      category: "strength",
      eventId,
      gps: "off",
      routeId,
    };
    render(<RecordSubmitRedirect />);

    expect(mocks.navigateProps).toEqual({
      replace: true,
      search: {
        activityType: "strength",
        category: "strength",
        eventId,
        from: "record",
        gps: "off",
        routeId,
      },
      to: "/activities/import",
    });
  });
});
