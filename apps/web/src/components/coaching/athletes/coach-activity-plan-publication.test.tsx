// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  previewQuery: vi.fn(),
  publish: vi.fn(),
  refreshSelectedPlan: vi.fn(),
  linkSearch: undefined as unknown,
  selectedPlanQueryState: "ready" as "error" | "loading" | "missing" | "not-editable" | "ready",
  selectedPlan: {
    activityPlanRevision: 3,
    id: "44444444-4444-4444-8444-444444444444",
    name: "Threshold",
  },
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
      getById: {
        useQuery: () => ({
          data:
            mocks.selectedPlanQueryState === "error" || mocks.selectedPlanQueryState === "loading"
              ? undefined
              : mocks.selectedPlanQueryState === "missing"
                ? { detail: undefined }
                : {
                    detail: {
                      ...mocks.selectedPlan,
                      capabilities: {
                        canEdit: mocks.selectedPlanQueryState !== "not-editable",
                      },
                    },
                  },
          error:
            mocks.selectedPlanQueryState === "error"
              ? new Error("Selected plan request failed")
              : null,
          isError: mocks.selectedPlanQueryState === "error",
          isFetching: false,
          isLoading: mocks.selectedPlanQueryState === "loading",
          refetch: mocks.refreshSelectedPlan,
        }),
      },
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
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, search }: { children: React.ReactNode; search?: unknown }) => {
    mocks.linkSearch = search;
    return <a href="/activity-plans">{children}</a>;
  },
}));

import { CoachActivityPlanPublication } from "./coach-activity-plan-publication";

afterEach(() => {
  cleanup();
  mocks.preview.mockReset();
  mocks.previewQuery.mockReset();
  mocks.publish.mockReset();
  mocks.refreshSelectedPlan.mockReset();
  mocks.linkSearch = undefined;
  mocks.selectedPlanQueryState = "ready";
  mocks.selectedPlan = {
    activityPlanRevision: 3,
    id: "44444444-4444-4444-8444-444444444444",
    name: "Threshold",
  };
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

  it("returns from preparation with the selected plan and date, but still requires a fresh preview", () => {
    render(
      <CoachActivityPlanPublication
        athleteId="22222222-2222-4222-8222-222222222222"
        organizationId="11111111-1111-4111-8111-111111111111"
        preparation={{
          activityPlanId: "44444444-4444-4444-8444-444444444444",
          athleteId: "22222222-2222-4222-8222-222222222222",
          organizationId: "11111111-1111-4111-8111-111111111111",
          planningDate: "2026-11-12",
          returnTo: "athlete-workspace",
        }}
      />,
    );

    expect((screen.getByLabelText("Your activity plan") as HTMLSelectElement).value).toBe(
      "44444444-4444-4444-8444-444444444444",
    );
    expect((screen.getByLabelText("Athlete planning date") as HTMLInputElement).value).toBe(
      "2026-11-12",
    );
    expect(screen.getByText(/fresh publication preview is still required/i)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Publish activity plan" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("uses the current planning date when preparing again from a returned flow", () => {
    render(
      <CoachActivityPlanPublication
        athleteId="22222222-2222-4222-8222-222222222222"
        organizationId="11111111-1111-4111-8111-111111111111"
        preparation={{
          activityPlanId: "44444444-4444-4444-8444-444444444444",
          athleteId: "22222222-2222-4222-8222-222222222222",
          organizationId: "11111111-1111-4111-8111-111111111111",
          planningDate: "2026-11-12",
          returnTo: "athlete-workspace",
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Athlete planning date"), {
      target: { value: "2026-11-13" },
    });

    expect(mocks.linkSearch).toEqual({
      activityPlanId: "44444444-4444-4444-8444-444444444444",
      athleteId: "22222222-2222-4222-8222-222222222222",
      organizationId: "11111111-1111-4111-8111-111111111111",
      planningDate: "2026-11-13",
      returnTo: "athlete-workspace",
    });
  });

  it("resolves a prepared owned plan outside the first library page", async () => {
    mocks.selectedPlan = {
      activityPlanRevision: 7,
      id: "55555555-5555-4555-8555-555555555555",
      name: "Later plan",
    };
    mocks.preview.mockResolvedValue({
      data: {
        athleteTimezone: "Europe/London",
        versionMatches: true,
        activityPlan: { name: "Later plan", revision: 7 },
      },
    });
    render(
      <CoachActivityPlanPublication
        athleteId="22222222-2222-4222-8222-222222222222"
        organizationId="11111111-1111-4111-8111-111111111111"
        preparation={{
          activityPlanId: "55555555-5555-4555-8555-555555555555",
          athleteId: "22222222-2222-4222-8222-222222222222",
          organizationId: "11111111-1111-4111-8111-111111111111",
          planningDate: "2026-11-12",
          returnTo: "athlete-workspace",
        }}
      />,
    );

    expect((screen.getByLabelText("Your activity plan") as HTMLSelectElement).value).toBe(
      "55555555-5555-4555-8555-555555555555",
    );
    expect(
      screen.getByRole("option", { name: "Later plan · version 7" }).getAttribute("value"),
    ).toBe("55555555-5555-4555-8555-555555555555");

    fireEvent.click(screen.getByRole("button", { name: "Preview publication" }));

    await waitFor(() =>
      expect(mocks.previewQuery).toHaveBeenLastCalledWith(
        expect.objectContaining({
          activityPlanId: "55555555-5555-4555-8555-555555555555",
          activityPlanRevision: 7,
        }),
      ),
    );
  });

  it("explains a selected-plan fetch failure and lets the coach retry", () => {
    mocks.selectedPlanQueryState = "error";
    render(
      <CoachActivityPlanPublication
        athleteId="22222222-2222-4222-8222-222222222222"
        organizationId="11111111-1111-4111-8111-111111111111"
        preparation={{
          activityPlanId: "44444444-4444-4444-8444-444444444444",
          athleteId: "22222222-2222-4222-8222-222222222222",
          organizationId: "11111111-1111-4111-8111-111111111111",
          planningDate: "2026-11-12",
          returnTo: "athlete-workspace",
        }}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "The selected activity plan could not be loaded",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry selected activity plan" }));
    expect(mocks.refreshSelectedPlan).toHaveBeenCalledWith({ throwOnError: true });
  });

  it("refreshes a stale revision and requires a new explicit preview", async () => {
    mocks.preview.mockResolvedValueOnce({
      data: {
        athleteTimezone: "Europe/London",
        versionMatches: false,
        activityPlan: { name: "Threshold", revision: 4 },
      },
    });
    mocks.refreshSelectedPlan.mockImplementation(async () => {
      mocks.selectedPlan = { ...mocks.selectedPlan, activityPlanRevision: 4 };
      return {
        data: { detail: { ...mocks.selectedPlan, capabilities: { canEdit: true } } },
      };
    });
    render(
      <CoachActivityPlanPublication
        athleteId="22222222-2222-4222-8222-222222222222"
        organizationId="11111111-1111-4111-8111-111111111111"
        preparation={{
          activityPlanId: "44444444-4444-4444-8444-444444444444",
          athleteId: "22222222-2222-4222-8222-222222222222",
          organizationId: "11111111-1111-4111-8111-111111111111",
          planningDate: "2026-11-12",
          returnTo: "athlete-workspace",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview publication" }));
    await screen.findByRole("button", { name: "Refresh activity plan" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh activity plan" }));
    await waitFor(() =>
      expect(mocks.refreshSelectedPlan).toHaveBeenCalledWith({ throwOnError: true }),
    );

    expect(screen.queryByText(/Ready to publish/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Publish activity plan" }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Preview publication" }));
    await waitFor(() =>
      expect(mocks.previewQuery).toHaveBeenLastCalledWith(
        expect.objectContaining({ activityPlanRevision: 4 }),
      ),
    );
  });
});
