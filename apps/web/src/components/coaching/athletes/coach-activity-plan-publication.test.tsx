// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  previewQuery: vi.fn(),
  publish: vi.fn(),
}));

vi.mock("../../../lib/api/client", () => ({
  api: {
    organizations: {
      listMine: {
        useQuery: () => ({
          data: {
            items: [
              {
                organization: { organizationId: "11111111-1111-4111-8111-111111111111" },
                membership: {
                  membershipId: "33333333-3333-4333-8333-333333333333",
                  roles: ["coach"],
                },
              },
            ],
          },
          isLoading: false,
        }),
      },
    },
    activityPlans: {
      list: {
        useQuery: () => ({
          data: {
            items: [
              {
                id: "44444444-4444-4444-8444-444444444444",
                name: "Threshold",
                activityPlanRevision: 3,
              },
            ],
          },
          isLoading: false,
        }),
      },
    },
    coachingPublication: {
      preview: {
        useQuery: (input: unknown) => {
          mocks.previewQuery(input);
          return { isFetching: false, refetch: mocks.preview };
        },
      },
      publish: { useMutation: () => ({ isPending: false, mutateAsync: mocks.publish }) },
    },
  },
}));

import { CoachActivityPlanPublication } from "./coach-activity-plan-publication";

afterEach(() => {
  cleanup();
  mocks.preview.mockReset();
  mocks.previewQuery.mockReset();
  mocks.publish.mockReset();
});

describe("CoachActivityPlanPublication", () => {
  it("requires a fresh successful preview before publishing the selected owned activity plan", async () => {
    mocks.preview.mockResolvedValue({
      data: {
        athleteTimezone: "Europe/London",
        versionMatches: true,
        activityPlan: { name: "Threshold", revision: 3 },
      },
    });
    mocks.publish.mockResolvedValue({});
    render(
      <CoachActivityPlanPublication
        athleteId="22222222-2222-4222-8222-222222222222"
        organizationId="11111111-1111-4111-8111-111111111111"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Publish activity plan" }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Your activity plan"), {
      target: { value: "44444444-4444-4444-8444-444444444444" },
    });
    fireEvent.change(screen.getByLabelText("Athlete planning date"), {
      target: { value: "2026-11-12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview publication" }));

    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1));
    expect(mocks.previewQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activityPlanId: "44444444-4444-4444-8444-444444444444",
        activityPlanRevision: 3,
        planningDate: "2026-11-12",
      }),
    );
    expect(mocks.preview).toHaveBeenCalledWith({ throwOnError: true });
    expect(screen.getByText(/Europe\/London planning time zone/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Publish activity plan" }));
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1));
    expect(mocks.publish.mock.calls[0]?.[0]).toMatchObject({
      activityPlanId: "44444444-4444-4444-8444-444444444444",
      activityPlanRevision: 3,
      athleteProfileId: "22222222-2222-4222-8222-222222222222",
      coachMembershipId: "33333333-3333-4333-8333-333333333333",
      organizationId: "11111111-1111-4111-8111-111111111111",
      planningDate: "2026-11-12",
    });
    expect(mocks.publish.mock.calls[0]?.[0].operationId).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
  });

  it("invalidates a preview when the athlete-local date changes", async () => {
    mocks.preview.mockResolvedValue({
      data: {
        athleteTimezone: "Europe/London",
        versionMatches: true,
        activityPlan: { name: "Threshold", revision: 3 },
      },
    });
    render(
      <CoachActivityPlanPublication
        athleteId="22222222-2222-4222-8222-222222222222"
        organizationId="11111111-1111-4111-8111-111111111111"
      />,
    );
    fireEvent.change(screen.getByLabelText("Your activity plan"), {
      target: { value: "44444444-4444-4444-8444-444444444444" },
    });
    fireEvent.change(screen.getByLabelText("Athlete planning date"), {
      target: { value: "2026-11-12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview publication" }));
    await screen.findByText(/Ready to publish/);
    fireEvent.change(screen.getByLabelText("Athlete planning date"), {
      target: { value: "2026-11-13" },
    });
    await waitFor(() => expect(screen.queryByText(/Ready to publish/)).toBeNull());
    expect(
      screen.getByRole("button", { name: "Publish activity plan" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
