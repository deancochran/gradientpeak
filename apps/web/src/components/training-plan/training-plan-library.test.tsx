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
              structure: {
                version: 1,
                activity_category: ["run", "strength"],
                durationWeeks: { recommended: 2 },
                sessions: [
                  {
                    offset_days: 0,
                    activity_plan_id: "11111111-1111-4111-8111-111111111111",
                  },
                  {
                    offset_days: 2,
                    activity_plan_id: "22222222-2222-4222-8222-222222222222",
                  },
                ],
              },
            },
            {
              id: "plan-2",
              name: "Unstructured plan",
              description: null,
              is_system_template: false,
              content_visibility: "private",
              structure: null,
              plannedSchedulePreview: null,
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
    expect(screen.getByText("Plan schedule")).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: /empty weeks have a baseline only.*not athlete-specific training load/,
      }),
    ).toBeTruthy();
    expect(screen.getByTestId("training-plan-visual-week-1")).toBeTruthy();
    expect(screen.getByTestId("training-plan-visual-bar-0")).toBeTruthy();
    expect(screen.queryByTestId("training-plan-visual-bar-1")).toBeNull();
    expect(screen.queryByTestId("training-plan-planned-preview-plan-2")).toBeNull();
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledWith("plan-1");
  });
});
