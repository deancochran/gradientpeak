// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  previewQuery: vi.fn(),
  publishPending: false,
  publish: vi.fn(),
  refreshSelectedPlan: vi.fn(),
  linkSearch: undefined as unknown,
  navigate: vi.fn(),
  routerSearch: {} as Record<string, unknown>,
  selectedPlanQueryState: "ready" as "error" | "loading" | "missing" | "not-editable" | "ready",
  selectedPlan: {
    activityCategory: "bike",
    activityPlanRevision: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    description: "Threshold work with a real prescription.",
    engagement: { likes: 0, viewerHasLiked: false },
    href: "/activity-plans/44444444-4444-4444-8444-444444444444",
    id: "44444444-4444-4444-8444-444444444444",
    isSystemTemplate: false,
    metrics: [],
    name: "Threshold",
    owner: null,
    structure: {
      activity_category: "bike",
      items: [
        {
          duration: { seconds: 600, type: "time" },
          id: "00000000-0000-4000-8000-000000000003",
          name: "Tempo block",
          targets: [{ intensity: 4, type: "RPE" }],
          type: "step",
        },
      ],
      version: 5,
    },
    updatedAt: "2026-01-01T00:00:00.000Z",
    visibility: "private" as const,
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
      publish: {
        useMutation: () => ({ isPending: mocks.publishPending, mutateAsync: mocks.publish }),
      },
    },
  },
}));
vi.mock("@tanstack/react-router", () => ({
  defaultParseSearch: (search: string) => Object.fromEntries(new URLSearchParams(search)),
  useNavigate: () => mocks.navigate,
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { search: Record<string, unknown> } }) => unknown;
  }) => select({ location: { search: mocks.routerSearch } }),
  Link: ({
    children,
    search,
    ...props
  }: {
    children: React.ReactNode;
    search?: unknown;
    [key: string]: unknown;
  }) => {
    mocks.linkSearch = search;
    const query =
      search && typeof search === "object"
        ? new URLSearchParams(search as Record<string, string>).toString()
        : "";
    return (
      <a {...props} href={`/activity-plans${query ? `?${query}` : ""}`}>
        {children}
      </a>
    );
  },
}));

import { CoachActivityPlanPublication } from "./coach-activity-plan-publication";

afterEach(() => {
  cleanup();
  mocks.preview.mockReset();
  mocks.previewQuery.mockReset();
  mocks.publishPending = false;
  mocks.publish.mockReset();
  mocks.refreshSelectedPlan.mockReset();
  mocks.linkSearch = undefined;
  mocks.navigate.mockReset();
  mocks.routerSearch = {};
  mocks.selectedPlanQueryState = "ready";
  mocks.selectedPlan = {
    activityCategory: "bike",
    activityPlanRevision: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    description: "Threshold work with a real prescription.",
    engagement: { likes: 0, viewerHasLiked: false },
    href: "/activity-plans/44444444-4444-4444-8444-444444444444",
    id: "44444444-4444-4444-8444-444444444444",
    isSystemTemplate: false,
    metrics: [],
    name: "Threshold",
    owner: null,
    structure: {
      activity_category: "bike",
      items: [
        {
          duration: { seconds: 600, type: "time" },
          id: "00000000-0000-4000-8000-000000000003",
          name: "Tempo block",
          targets: [{ intensity: 4, type: "RPE" }],
          type: "step",
        },
      ],
      version: 5,
    },
    updatedAt: "2026-01-01T00:00:00.000Z",
    visibility: "private" as const,
  };
});

describe("CoachActivityPlanPublication", () => {
  it("renders the selected owned plan with its canonical timeline and contextual inspect link", () => {
    mocks.routerSearch = { calendarStartDate: "2026-11-09" };
    render(
      <CoachActivityPlanPublication
        athleteId="22222222-2222-4222-8222-222222222222"
        organizationId="11111111-1111-4111-8111-111111111111"
        preparation={{
          activityPlanId: "44444444-4444-4444-8444-444444444444",
          athleteId: "22222222-2222-4222-8222-222222222222",
          calendarStartDate: "2026-11-09",
          organizationId: "11111111-1111-4111-8111-111111111111",
          planningDate: "2026-11-12",
          returnTo: "athlete-workspace",
        }}
      />,
    );

    const card = screen.getByTestId("activity-plan-card-44444444-4444-4444-8444-444444444444");
    expect(card).toBeTruthy();
    expect(
      screen.getByTestId("activity-plan-card-timeline-44444444-4444-4444-8444-444444444444"),
    ).toBeTruthy();
    expect(card.getAttribute("href")).toContain("athleteId=22222222-2222-4222-8222-222222222222");
    expect(card.getAttribute("href")).toContain("planningDate=2026-11-12");
    expect(card.getAttribute("href")).toContain("calendarStartDate=2026-11-09");
    expect(card.getAttribute("href")).toContain(
      "activityPlanId=44444444-4444-4444-8444-444444444444",
    );
  });

  it.each([
    "loading",
    "error",
    "not-editable",
  ] as const)("hides the selected visual while the owned-plan detail is %s", (selectedPlanQueryState) => {
    mocks.selectedPlanQueryState = selectedPlanQueryState;
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

    expect(
      screen.queryByTestId("activity-plan-card-44444444-4444-4444-8444-444444444444"),
    ).toBeNull();
  });

  it("resets the selected visual when the coach clears the plan choice", () => {
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

    fireEvent.change(screen.getByLabelText("Your activity plan"), { target: { value: "" } });

    expect(
      screen.queryByTestId("activity-plan-card-44444444-4444-4444-8444-444444444444"),
    ).toBeNull();
  });

  it("uses the semantic date input surface without forcing a dark native control", () => {
    render(<CoachActivityPlanPublication athleteId="athlete" organizationId="organization" />);

    const planningDate = screen.getByLabelText("Athlete planning date");
    expect(planningDate.className).toContain("border-input");
    expect(planningDate.className).toContain("bg-background");
    expect(planningDate.className).not.toContain("color-scheme:dark");
  });

  it("uses a real disabled button rather than a disabled-looking link until the date is valid", () => {
    render(<CoachActivityPlanPublication athleteId="athlete" organizationId="organization" />);

    const prepare = screen.getByRole("button", { name: "Prepare activity plan" });
    expect(prepare.hasAttribute("disabled")).toBe(true);
    expect(prepare.tagName).toBe("BUTTON");
    expect(screen.queryByRole("link", { name: "Prepare activity plan" })).toBeNull();
  });

  it("disables preparation and selected-plan inspection while publication is pending", () => {
    mocks.publishPending = true;
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

    expect(
      screen.getByRole("button", { name: "Prepare activity plan" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Inspect or edit selected activity plan Threshold" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.queryByRole("link", { name: "Prepare activity plan" })).toBeNull();
  });

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

  it("rejects a late A preview after the coach changes A to B and back to A", async () => {
    let resolveFirstPreview!: (value: {
      data: {
        athleteTimezone: string;
        versionMatches: boolean;
        activityPlan: { name: string; revision: number };
      };
    }) => void;
    mocks.preview.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirstPreview = resolve;
      }),
    );
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
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledOnce());

    fireEvent.change(screen.getByLabelText("Athlete planning date"), {
      target: { value: "2026-11-13" },
    });
    fireEvent.change(screen.getByLabelText("Athlete planning date"), {
      target: { value: "2026-11-12" },
    });
    await act(async () =>
      resolveFirstPreview({
        data: {
          athleteTimezone: "Europe/London",
          versionMatches: true,
          activityPlan: { name: "Threshold", revision: 3 },
        },
      }),
    );

    expect(screen.queryByText(/Ready to publish/)).toBeNull();
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

  it("does not replace an already-current validated workspace URL when a blank date draft is restored", () => {
    const preparation = {
      activityPlanId: "44444444-4444-4444-8444-444444444444",
      athleteId: "22222222-2222-4222-8222-222222222222",
      calendarStartDate: "2026-11-16",
      organizationId: "11111111-1111-4111-8111-111111111111",
      planningDate: "2026-11-23",
      returnTo: "athlete-workspace" as const,
    };
    mocks.routerSearch = preparation;
    render(
      <CoachActivityPlanPublication
        athleteId={preparation.athleteId}
        calendarStartDate={preparation.calendarStartDate}
        organizationId={preparation.organizationId}
        preparation={preparation}
      />,
    );
    mocks.navigate.mockClear();

    fireEvent.change(screen.getByLabelText("Athlete planning date"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Athlete planning date"), {
      target: { value: preparation.planningDate },
    });

    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("replaces the workspace URL with the current authoring context before leaving to prepare", () => {
    render(
      <CoachActivityPlanPublication
        athleteId="22222222-2222-4222-8222-222222222222"
        organizationId="11111111-1111-4111-8111-111111111111"
      />,
    );

    fireEvent.change(screen.getByLabelText("Athlete planning date"), {
      target: { value: "2026-11-23" },
    });

    const navigation = mocks.navigate.mock.calls.at(-1)?.[0] as {
      params: Record<string, string>;
      replace: boolean;
      search: (previous: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(navigation.params).toEqual({
      athleteId: "22222222-2222-4222-8222-222222222222",
      organizationId: "11111111-1111-4111-8111-111111111111",
    });
    expect(navigation.replace).toBe(true);
    expect(navigation.search({})).toMatchObject({
      planningDate: "2026-11-23",
      returnTo: "athlete-workspace",
    });
  });

  it("preserves a live pending calendar range in date changes and the prepare link", () => {
    mocks.routerSearch = { calendarStartDate: "2026-11-28" };
    render(
      <CoachActivityPlanPublication
        athleteId="22222222-2222-4222-8222-222222222222"
        organizationId="11111111-1111-4111-8111-111111111111"
      />,
    );

    fireEvent.change(screen.getByLabelText("Athlete planning date"), {
      target: { value: "2026-11-23" },
    });

    const navigation = mocks.navigate.mock.calls.at(-1)?.[0] as {
      search: (previous: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(navigation.search({ calendarStartDate: "2026-12-05" })).toMatchObject({
      calendarStartDate: "2026-12-05",
      planningDate: "2026-11-23",
    });
    expect(mocks.linkSearch).toMatchObject({
      calendarStartDate: "2026-11-28",
      planningDate: "2026-11-23",
    });
  });

  it("removes a cleared local plan from the URL instead of reviving it on Back", () => {
    render(
      <CoachActivityPlanPublication
        athleteId="22222222-2222-4222-8222-222222222222"
        organizationId="11111111-1111-4111-8111-111111111111"
        preparation={{
          activityPlanId: "44444444-4444-4444-8444-444444444444",
          athleteId: "22222222-2222-4222-8222-222222222222",
          organizationId: "11111111-1111-4111-8111-111111111111",
          planningDate: "2026-11-23",
          returnTo: "athlete-workspace",
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Your activity plan"), { target: { value: "" } });

    const navigation = mocks.navigate.mock.calls.at(-1)?.[0] as {
      search: (previous: Record<string, unknown>) => Record<string, unknown>;
    };
    const nextSearch = navigation.search({
      activityPlanId: "44444444-4444-4444-8444-444444444444",
      athleteId: "22222222-2222-4222-8222-222222222222",
      organizationId: "11111111-1111-4111-8111-111111111111",
      planningDate: "2026-11-23",
      returnTo: "athlete-workspace",
    });
    expect(nextSearch).not.toHaveProperty("activityPlanId");
    expect(nextSearch).toMatchObject({ planningDate: "2026-11-23" });
  });

  it("retains a newer blank date draft when a delayed local plan-selection URL update arrives", () => {
    const props = {
      athleteId: "22222222-2222-4222-8222-222222222222",
      organizationId: "11111111-1111-4111-8111-111111111111",
    };
    const view = render(<CoachActivityPlanPublication {...props} />);
    const date = screen.getByLabelText("Athlete planning date");
    fireEvent.change(date, { target: { value: "2026-11-23" } });
    fireEvent.change(screen.getByLabelText("Your activity plan"), {
      target: { value: "44444444-4444-4444-8444-444444444444" },
    });
    fireEvent.change(date, { target: { value: "" } });

    view.rerender(
      <CoachActivityPlanPublication
        {...props}
        preparation={{
          activityPlanId: "44444444-4444-4444-8444-444444444444",
          athleteId: props.athleteId,
          organizationId: props.organizationId,
          planningDate: "2026-11-23",
          returnTo: "athlete-workspace",
        }}
      />,
    );

    expect((screen.getByLabelText("Athlete planning date") as HTMLInputElement).value).toBe("");
  });

  it("resolves a prepared owned plan outside the first library page", async () => {
    mocks.selectedPlan = {
      ...mocks.selectedPlan,
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
