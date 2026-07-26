// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrainingPlanDetail } from "./training-plan-detail";

const mocks = vi.hoisted(() => ({
  mutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  plan: {
    id: "plan-1",
    profile_id: "profile-1",
    name: "Base plan",
    description: null,
    structure_hash: "hash",
    structure: { version: 1, sessions: [] },
    is_system_template: false,
    template_visibility: "private",
  },
  weeklyData: [
    {
      weekStart: "2026-03-01",
      planAlignment: {
        status: "partial",
        score: 82,
        assessableSessions: 2,
        totalSessions: 3,
        unverifiedSessions: 1,
      },
    },
  ] as Array<{
    weekStart: string;
    planAlignment: {
      status: "available" | "partial" | "unavailable";
      score: number | null;
      assessableSessions: number;
      totalSessions: number;
      unverifiedSessions: number;
    };
  }>,
}));

vi.mock("../../lib/api/client", () => ({
  api: {
    useUtils: () => ({ trainingPlans: { invalidate: vi.fn() } }),
    profiles: { get: { useQuery: () => ({ data: { id: "profile-1" } }) } },
    trainingPlans: {
      get: { useQuery: () => ({ data: mocks.plan, error: null, isLoading: false }) },
      getActivePlan: { useQuery: () => ({ data: null }) },
      getInsightTimeline: { useQuery: () => ({ data: null, error: null, isLoading: false }) },
      getWeeklySummary: {
        useQuery: () => ({
          data: mocks.weeklyData,
          error: null,
          isLoading: false,
        }),
      },
      update: { useMutation: mocks.mutation },
      duplicate: { useMutation: mocks.mutation },
      removeAppliedSchedule: { useMutation: mocks.mutation },
      applyTemplate: { useMutation: mocks.mutation },
      delete: { useMutation: mocks.mutation },
    },
    activityPlans: {
      getManyByIds: { useQuery: () => ({ data: { items: [] }, error: null, isLoading: false }) },
    },
    social: { toggleLike: { useMutation: mocks.mutation } },
  },
}));

describe("TrainingPlanDetail plan alignment", () => {
  afterEach(() => {
    mocks.weeklyData = [];
  });

  it("shows alignment evidence and never invents a zero score", () => {
    render(
      <TrainingPlanDetail
        planId="plan-1"
        onDeleted={vi.fn()}
        onEdit={vi.fn()}
        onOpenDuplicate={vi.fn()}
      />,
    );
    expect(screen.getByText("Plan alignment")).toBeTruthy();
    expect(screen.getAllByText(/82%/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2 of 3 sessions assessed/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1 unverified/).length).toBeGreaterThan(0);
    expect(screen.queryByText("0% adherence")).toBeNull();
  });

  it("renders unavailable alignment as an em dash rather than zero percent", () => {
    mocks.weeklyData = [
      {
        weekStart: "2026-03-01",
        planAlignment: {
          status: "unavailable",
          score: null,
          assessableSessions: 0,
          totalSessions: 0,
          unverifiedSessions: 0,
        },
      },
    ];

    render(
      <TrainingPlanDetail
        planId="plan-1"
        onDeleted={vi.fn()}
        onEdit={vi.fn()}
        onOpenDuplicate={vi.fn()}
      />,
    );

    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getAllByText(/0 of 0 sessions assessed/).length).toBeGreaterThan(0);
    expect(screen.queryByText("0%")).toBeNull();
  });
});
