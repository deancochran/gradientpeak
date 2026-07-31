// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrainingPlanLibrary } from "./training-plan-library";

const mocks = vi.hoisted(() => ({
  owned: {
    data: {
      pages: [
        {
          items: [
            {
              id: "plan-1",
              name: "Base builder",
              description: "Build durable fitness.",
              is_system_template: false,
              content_visibility: "private",
              structure: { sessions: [] },
            },
          ],
        },
      ],
    },
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  templates: {
    data: { pages: [{ items: [] }] },
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
    refetch: vi.fn(),
  },
}));

vi.mock("../../lib/api/client", () => ({
  api: {
    trainingPlans: {
      list: { useInfiniteQuery: () => mocks.owned },
      listTemplates: { useInfiniteQuery: () => mocks.templates },
    },
  },
}));

afterEach(cleanup);

describe("TrainingPlanLibrary", () => {
  it("provides stable selectors for creation and each plan card action", () => {
    const onCreate = vi.fn();
    const onOpen = vi.fn();
    render(<TrainingPlanLibrary onCreate={onCreate} onOpen={onOpen} />);

    fireEvent.click(screen.getByTestId("training-plan-create"));
    fireEvent.click(screen.getByTestId("training-plan-card-plan-1-open"));

    expect(screen.getByTestId("training-plan-card-plan-1")).toBeTruthy();
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledWith("plan-1");
  });
});
