// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgendaCreateForm } from "./agenda-create-form";

const mocks = vi.hoisted(() => ({
  action: vi.fn(),
  plannedCreate: vi.fn(),
  activityPlansQuery: {
    data: { items: [] as Array<{ id: string; name: string }> },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.action }));
vi.mock("@repo/api/react", () => ({
  usePlannedSessionMutations: () => ({
    create: { isPending: false, mutateAsync: mocks.plannedCreate },
  }),
}));
vi.mock("../../lib/api/client", () => ({
  api: {
    useUtils: () => ({ plannedSessions: { range: { fetch: vi.fn() } } }),
    activityPlans: { list: { useQuery: () => mocks.activityPlansQuery } },
    profiles: {
      get: {
        useQuery: () => ({ data: { id: "11111111-1111-4111-8111-111111111111" }, isError: false }),
      },
    },
  },
}));
vi.mock("../../lib/planning/server-actions", () => ({
  createCalendarEventAction: { url: "/actions/calendar/create" },
}));

afterEach(() => {
  cleanup();
  mocks.action.mockReset();
  mocks.plannedCreate.mockReset();
  mocks.activityPlansQuery.data = { items: [] };
  mocks.activityPlansQuery.isError = false;
  mocks.activityPlansQuery.isLoading = false;
  mocks.activityPlansQuery.refetch.mockReset();
});

function getForm() {
  const form = screen.getByRole("button", { name: /create|creating/i }).closest("form");
  if (!(form instanceof HTMLFormElement))
    throw new Error("Expected the create button to be inside a form.");
  return form;
}

describe("AgendaCreateForm", () => {
  it("keeps the create draft and announces a rejected server submission", async () => {
    mocks.action.mockRejectedValueOnce(new Error("Create request failed"));
    render(<AgendaCreateForm initialDate="2026-10-26" />);

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Morning ride" } });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Bring bottles" } });
    fireEvent.submit(getForm());

    expect((await screen.findByRole("alert")).textContent).toContain("Create request failed");
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Morning ride");
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("Bring bottles");
  });

  it("prevents duplicate create submissions while the request is pending", async () => {
    let resolve!: () => void;
    mocks.action.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    render(<AgendaCreateForm initialDate="2026-10-26" />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Morning ride" } });
    const form = getForm();

    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(1));
    expect(
      (screen.getByRole("button", { name: "Creating..." }) as HTMLButtonElement).disabled,
    ).toBe(true);
    resolve();
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Create" }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
  });

  it("submits the selected activity plan when creating planned work", async () => {
    mocks.activityPlansQuery.data = {
      items: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Tempo ride",
          activityPlanRevision: 4,
          prescriptionQuantification: null,
          structure: {
            version: 3,
            activity_category: "bike",
            segments: [
              {
                id: "33333333-3333-4333-8333-333333333333",
                role: "activity",
                name: "Ride",
                intervals: [
                  {
                    id: "44444444-4444-4444-8444-444444444444",
                    name: "Tempo",
                    repetitions: 1,
                    steps: [
                      {
                        id: "55555555-5555-4555-8555-555555555555",
                        name: "Work",
                        duration: { type: "time", seconds: 600 },
                        targets: [{ type: "RPE", intensity: 7 }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        } as never,
      ],
    };
    render(<AgendaCreateForm initialDate="2026-10-26" initialType="planned" />);

    fireEvent.change(screen.getByLabelText("Activity plan"), {
      target: { value: "22222222-2222-4222-8222-222222222222" },
    });
    fireEvent.submit(getForm());

    await waitFor(() => expect(mocks.plannedCreate).toHaveBeenCalledTimes(1));
    expect(mocks.action).not.toHaveBeenCalled();
    expect(mocks.plannedCreate.mock.calls[0]?.[0]).toMatchObject({
      profileId: "11111111-1111-4111-8111-111111111111",
      session: {
        planningDate: "2026-10-26",
        activityPlanId: "22222222-2222-4222-8222-222222222222",
      },
    });
    expect(mocks.plannedCreate.mock.calls[0]?.[0].session).not.toHaveProperty("prescription");
  });

  it("lets users retry loading activity plans", () => {
    mocks.activityPlansQuery.isError = true;
    render(<AgendaCreateForm initialType="planned" />);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.activityPlansQuery.refetch).toHaveBeenCalledOnce();
  });
});
