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
beforeEach(() => {
  mocks.owned.data = initialData;
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
    fireEvent.click(screen.getByTestId("training-plan-card-plan-1-open"));

    expect(screen.getByTestId("training-plan-card-plan-1")).toBeTruthy();
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledWith("plan-1");
  });
});
