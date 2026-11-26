// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrainingPlanLibrary } from "./training-plan-library";

const mocks = vi.hoisted(() => ({
  ownedInput: vi.fn(),
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
    error: null as Error | null,
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
      list: {
        useInfiniteQuery: (input: unknown) => {
          mocks.ownedInput(input);
          return mocks.owned;
        },
      },
      listTemplates: { useInfiniteQuery: () => mocks.templates },
    },
  },
}));

afterEach(cleanup);
const initialData = mocks.owned.data;
const initialTemplateData = mocks.templates.data;
beforeEach(() => {
  mocks.owned.data = initialData;
  mocks.templates.data = initialTemplateData;
  mocks.owned.error = null;
  mocks.owned.isLoading = false;
  mocks.owned.hasNextPage = false;
  mocks.owned.fetchNextPage.mockReset();
  mocks.owned.refetch.mockReset();
  mocks.ownedInput.mockReset();
});

describe("TrainingPlanLibrary", () => {
  it("distinguishes initial error from empty and retries with the same search", async () => {
    mocks.owned.data = { pages: [] };
    mocks.owned.error = new Error("Offline");
    render(<TrainingPlanLibrary onCreate={vi.fn()} onOpen={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search plans"), { target: { value: "base" } });
    expect(screen.getByRole("alert").textContent).toContain("Offline");
    expect(screen.queryByText("No training plans found.")).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry" })));
    expect(mocks.owned.refetch).toHaveBeenCalledOnce();
    expect((screen.getByLabelText("Search plans") as HTMLInputElement).value).toBe("base");
    expect(mocks.ownedInput).toHaveBeenLastCalledWith({
      ownerScope: "own",
      search: "base",
      limit: 25,
    });
  });

  it("shows loading and suppresses duplicate page requests while retaining existing results", async () => {
    mocks.owned.isLoading = true;
    const view = render(<TrainingPlanLibrary onCreate={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByText("Loading training plans…")).toBeTruthy();
    expect(screen.queryByText("No training plans found.")).toBeNull();
    mocks.owned.isLoading = false;
    mocks.owned.hasNextPage = true;
    let resolve!: () => void;
    mocks.owned.fetchNextPage.mockReturnValue(
      new Promise<void>((done) => {
        resolve = done;
      }),
    );
    view.rerender(<TrainingPlanLibrary onCreate={vi.fn()} onOpen={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Load more" });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(mocks.owned.fetchNextPage).toHaveBeenCalledOnce();
    expect(screen.getByTestId("training-plan-card-plan-1")).toBeTruthy();
    await act(async () => resolve());
    const nextPlan = initialData.pages[0]?.items[0];
    if (!nextPlan) throw new Error("Missing plan fixture");
    mocks.owned.data = {
      pages: [
        ...initialData.pages,
        { items: [{ ...nextPlan, id: "plan-3", name: "Next page plan" }] },
      ],
    };
    view.rerender(<TrainingPlanLibrary onCreate={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.getByTestId("training-plan-card-plan-3")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search plans"), { target: { value: "next" } });
    expect(mocks.ownedInput).toHaveBeenLastCalledWith({
      ownerScope: "own",
      search: "next",
      limit: 25,
    });
  });

  it("provides stable selectors for creation and each plan card action", () => {
    const onCreate = vi.fn();
    const onOpen = vi.fn();
    render(<TrainingPlanLibrary onCreate={onCreate} onOpen={onOpen} />);

    fireEvent.click(screen.getByTestId("training-plan-create"));
    fireEvent.click(screen.getByRole("button", { name: "Open training plan Base builder" }));

    expect(screen.getByTestId("training-plan-card-plan-1")).toBeTruthy();
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledWith("plan-1");
  });

  it("uses the flat template-list projection rather than inventing owned-plan defaults", () => {
    mocks.templates.data = {
      pages: [
        {
          items: [
            {
              id: "template-1",
              name: "System template",
              description: "Canonical template projection",
              version: 1,
              plan_preferences: {
                weekly_session_count: 3,
                target_weekly_duration_minutes: 180,
                maximum_session_duration_minutes: 90,
                preferred_weekdays: [1, 3, 6],
                rest_days: [0],
                progression_style: "balanced",
                recovery_priority: "balanced",
              },
              sessions: [
                {
                  id: "11111111-1111-4111-8111-111111111111",
                  offset_days: 0,
                  activity_plan_id: "22222222-2222-4222-8222-222222222222",
                  demand: {
                    activity_category: "bike",
                    training_intent: "general_maintenance",
                    target_duration_minutes: null,
                    target_common_load: null,
                    importance: "normal",
                  },
                  event_overrides: { title: "Template tempo" },
                },
              ],
            },
          ],
        },
      ],
    } as never;

    render(<TrainingPlanLibrary onCreate={vi.fn()} onOpen={vi.fn()} tab="templates" />);

    expect(screen.getByText("Template", { exact: true })).toBeTruthy();
    expect(screen.queryByText("private", { exact: true })).toBeNull();
    expect(screen.getByText("Schedule")).toBeTruthy();
    expect(screen.getByText("1 activities · 1 weeks")).toBeTruthy();
    expect(screen.queryByText(/Flexible sessions\/week/)).toBeNull();
  });
});
