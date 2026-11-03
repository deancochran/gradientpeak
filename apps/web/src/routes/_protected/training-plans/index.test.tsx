// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  navigate: vi.fn(),
  props: null as Record<string, unknown> | null,
  search: { q: "base", tab: "templates" as const },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => state.navigate,
    useSearch: () => state.search,
  }),
}));
vi.mock("../../../components/training-plan/training-plan-library", () => ({
  TrainingPlanLibrary: (props: Record<string, unknown>) => {
    state.props = props;
    return null;
  },
}));

import { Route } from "./index";

afterEach(() => {
  cleanup();
  state.navigate.mockReset();
  state.props = null;
});

it("preserves the selected library tab in the URL contract and library props", () => {
  const route = Route as unknown as {
    component: React.ComponentType;
    validateSearch: (search: Record<string, unknown>) => unknown;
  };
  expect(route.validateSearch({ q: "x", tab: "templates" })).toEqual({
    q: "x",
    tab: "templates",
  });
  expect(route.validateSearch({ tab: "unexpected" })).toEqual({
    q: undefined,
    tab: "owned",
  });

  render(<route.component />);
  expect(state.props).toMatchObject({ searchValue: "base", tab: "templates" });
});
