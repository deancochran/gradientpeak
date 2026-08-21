// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrainingPlanDetail } from "./training-plan-detail";

const mocks = vi.hoisted(() => ({
  mutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  activePlan: null as { id: string; scheduleBatchId: string } | null,
  plan: {
    id: "plan-1",
    profile_id: "profile-1",
    name: "Base plan",
    description: null,
    structure_hash: "hash",
    structure: {
      version: 1,
      activity_category: ["bike"],
      durationWeeks: { recommended: 2 },
      goal_blueprints: [
        {
          title: "Goal day",
          priority: 10,
          activity_category: "bike",
          target_offset_days: 8,
        },
      ],
      sessions: [
        {
          offset_days: 0,
          activity_plan_id: "11111111-1111-4111-8111-111111111111",
        },
        {
          offset_days: 8,
          activity_plan_id: "22222222-2222-4222-8222-222222222222",
        },
      ],
    },
    is_system_template: false,
    content_visibility: "private",
    editor: {
      revision: 1,
      structureHash: `v1:sha256:${"a".repeat(64)}`,
      validation: { status: "current" },
    },
  },
  removeAppliedScheduleMutation: vi.fn(),
}));

vi.mock("../../lib/api/client", () => ({
  api: {
    useUtils: () => ({ trainingPlans: { invalidate: vi.fn() } }),
    profiles: { get: { useQuery: () => ({ data: { id: "profile-1" } }) } },
    trainingPlans: {
      get: { useQuery: () => ({ data: mocks.plan, error: null, isLoading: false }) },
      getPlanTabProjection: {
        useQuery: () => ({ data: { currentScheduledPlan: mocks.activePlan } }),
      },
      commit: { useMutation: mocks.mutation },
      removeAppliedSchedule: {
        useMutation: () => ({ isPending: false, mutateAsync: mocks.removeAppliedScheduleMutation }),
      },
      applyTemplate: { useMutation: mocks.mutation },
      delete: { useMutation: mocks.mutation },
    },
    activityPlans: {
      getManyByIds: { useQuery: () => ({ data: { items: [] }, error: null, isLoading: false }) },
    },
    social: { toggleLike: { useMutation: mocks.mutation } },
  },
}));

describe("TrainingPlanDetail", () => {
  afterEach(() => {
    mocks.activePlan = null;
    mocks.removeAppliedScheduleMutation.mockReset();
  });

  it("shows the authoritative projection status", () => {
    render(
      <TrainingPlanDetail
        planId="plan-1"
        onDeleted={vi.fn()}
        onEdit={vi.fn()}
        onOpenDuplicate={vi.fn()}
      />,
    );
    expect(screen.getByText("Projection status")).toBeTruthy();
    expect(screen.getByText("current")).toBeTruthy();
    expect(screen.getByText("Plan schedule")).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: /empty weeks have a baseline only.*not athlete-specific training load/,
      }),
    ).toBeTruthy();
    expect(screen.getByTestId("training-plan-visual-week-1")).toBeTruthy();
    expect(screen.getByTestId("training-plan-visual-goal-1")).toBeTruthy();
    expect(screen.getByTestId("training-plan-visual-bar-0")).toBeTruthy();
  });

  it("removes the active schedule with the displayed plan and active batch IDs", async () => {
    mocks.activePlan = { id: "plan-1", scheduleBatchId: "schedule-batch-1" };

    render(
      <TrainingPlanDetail
        planId="plan-1"
        onDeleted={vi.fn()}
        onEdit={vi.fn()}
        onOpenDuplicate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove schedule" }));

    await waitFor(() =>
      expect(mocks.removeAppliedScheduleMutation).toHaveBeenCalledWith({
        training_plan_id: "plan-1",
        schedule_batch_id: "schedule-batch-1",
      }),
    );
  });
});
