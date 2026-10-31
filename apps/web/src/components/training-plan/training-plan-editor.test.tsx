// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrainingPlanEditor } from "./training-plan-editor";
import { buildTrainingPlanStructure } from "./training-plan-model";

vi.mock("@tanstack/react-router", () => ({ useBlocker: vi.fn() }));
vi.mock("../providers/auth-provider", () => ({
  useAuth: () => ({ user: mocks.accountId ? { id: mocks.accountId } : null, isLoading: false }),
}));
async function renderReady(element: React.ReactElement) {
  const view = render(element);
  await act(async () => {});
  return view;
}

const planId = "22222222-2222-4222-8222-222222222222";
const mocks = vi.hoisted(() => ({
  accountId: "11111111-1111-4111-8111-111111111111" as string | null,
  baselineQuery: {} as Record<string, unknown>,
  create: vi.fn(),
  invalidate: vi.fn(),
  preview: vi.fn(),
  previewState: "available" as "available" | "error" | "loading" | "unavailable",
  refetchBaseline: vi.fn(),
  plan: undefined as undefined | Record<string, unknown>,
  activitySearch: vi.fn(),
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  extraPages: [] as {
    items: { id: string; name: string; activityCategory: string; metrics: [] }[];
  }[],
}));

vi.mock("../../lib/api/client", () => ({
  api: {
    useUtils: () => ({
      trainingPlans: {
        invalidate: mocks.invalidate,
        preview: {
          fetch: mocks.preview,
        },
      },
    }),
    athleteIntelligence: {
      getReadModel: { useQuery: () => mocks.baselineQuery },
    },
    profiles: {
      get: {
        useQuery: () => ({
          data: { id: "44444444-4444-4444-8444-444444444444" },
          error: null,
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
    },
    trainingPlans: {
      get: {
        useQuery: () => ({ data: mocks.plan, error: null, isLoading: false, refetch: vi.fn() }),
      },
      preview: {
        useQuery: (input: unknown) => {
          const enabled = Boolean(input && typeof input === "object");
          return {
            data:
              enabled && mocks.previewState === "available"
                ? {
                    status: "available",
                    applicable: true,
                    explanations: [],
                    basePublishedRevision: mocks.baselineQuery.data
                      ? (mocks.baselineQuery.data as { publishedRevision: number })
                          .publishedRevision
                      : 4,
                    previewFingerprint: `v1:sha256:${"a".repeat(64)}`,
                    simulation: {
                      projectedState: { longTermLoad: 42, recentLoad: 36, loadBalance: 6 },
                      goalAssessment: null,
                    },
                  }
                : enabled && mocks.previewState === "unavailable"
                  ? { status: "unavailable" }
                  : undefined,
            error: enabled && mocks.previewState === "error" ? new Error("preview offline") : null,
            isFetching: enabled && mocks.previewState === "loading",
            isLoading: enabled && mocks.previewState === "loading",
            refetch: vi.fn(),
          };
        },
      },
      commit: {
        useMutation: () => ({ isPending: false, mutateAsync: mocks.create }),
      },
    },
    activityPlans: {
      list: {
        useInfiniteQuery: (input: unknown) => {
          mocks.activitySearch(input);
          return {
            data: {
              pages: [
                {
                  items: [
                    {
                      id: "11111111-1111-4111-8111-111111111111",
                      name: "Aerobic ride",
                      activityCategory: "bike",
                      metrics: [
                        {
                          key: "common_load",
                          status: "available",
                          value: 80,
                        },
                      ],
                    },
                  ],
                },
                ...mocks.extraPages,
              ],
            },
            error: null,
            isLoading: false,
            hasNextPage: mocks.hasNextPage,
            isFetchingNextPage: false,
            fetchNextPage: mocks.fetchNextPage,
          };
        },
      },
    },
  },
}));

beforeEach(() => {
  mocks.accountId = "11111111-1111-4111-8111-111111111111";
  mocks.invalidate.mockReset().mockResolvedValue(undefined);
  mocks.hasNextPage = false;
  mocks.extraPages = [];
  mocks.plan = undefined;
  mocks.baselineQuery = baselineQuery(4, 40, 30);
  mocks.previewState = "available";
  mocks.preview.mockReset().mockResolvedValue({
    status: "available" as const,
    applicable: true,
    explanations: [],
    basePublishedRevision: 4,
    previewFingerprint: `v1:sha256:${"a".repeat(64)}`,
    simulation: {
      projectedState: { longTermLoad: 42, recentLoad: 36, loadBalance: 6 },
      goalAssessment: null,
    },
  });
  mocks.create.mockReset().mockResolvedValue({ status: "saved", planId });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TrainingPlanEditor", () => {
  it("retains an open form during backgrounding but drops it on page exit and browser cached return", async () => {
    await renderReady(<TrainingPlanEditor onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Temporary training plan" },
    });
    fireEvent(document, new Event("visibilitychange"));
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Temporary training plan");
    fireEvent(window, new Event("pagehide"));
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Discard on return" } });
    fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }));
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "");
    expect(screen.queryByRole("button", { name: /resume|stored save|recovery/i })).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("allows Cancel during preview, forgets that attempt and never commits its late preview", async () => {
    let finish!: (value: object) => void;
    mocks.preview.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const saved = vi.fn();
    const cancel = vi.fn();
    await renderReady(<TrainingPlanEditor onSaved={saved} onCancel={cancel} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Old intent" } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel changes" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Fresh intent" } });
    await act(async () =>
      finish({
        status: "available",
        applicable: true,
        basePublishedRevision: 4,
        previewFingerprint: `v1:sha256:${"a".repeat(64)}`,
        explanations: [],
      }),
    );
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Fresh intent");
  });
  it("locks preview/save settlement against duplicate submits and editing, while allowing Cancel", async () => {
    let finishPreview!: (value: object) => void;
    let finishSave!: (value: object) => void;
    mocks.preview.mockReturnValueOnce(
      new Promise((resolve) => {
        finishPreview = resolve;
      }),
    );
    mocks.create.mockReturnValueOnce(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    const onSaved = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderReady(<TrainingPlanEditor onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Frozen intent" } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    const form = screen.getByLabelText("Name").closest("form");
    if (!form) throw new Error("Missing plan form");
    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Late edit" } });
    expect(screen.getByRole("button", { name: "Cancel changes" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Frozen intent");
    expect(screen.getByRole("button", { name: "Saving…" })).toHaveProperty("disabled", true);
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    await act(async () =>
      finishPreview({
        status: "available",
        applicable: true,
        basePublishedRevision: 4,
        previewFingerprint: `v1:sha256:${"a".repeat(64)}`,
        explanations: [],
      }),
    );
    expect(mocks.create).toHaveBeenCalledTimes(1);
    fireEvent.submit(form);
    await act(async () => finishSave({ status: "saved", planId }));
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0]?.[0].draft.name).toBe("Frozen intent");
    confirm.mockRestore();
  });

  it("keeps preview errors editable and does not report an unsent commit as uncertain", async () => {
    mocks.preview.mockRejectedValueOnce(new Error("Preview offline"));
    await renderReady(<TrainingPlanEditor onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Retry preview" } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    expect((await screen.findByRole("alert")).textContent).toContain("No commit was sent");
    expect(mocks.create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Repaired" } });
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Repaired");
  });

  it("pins the hydrated revision even when the server refetches a newer revision", async () => {
    mocks.plan = {
      id: planId,
      name: "Saved",
      description: "",
      content_visibility: "private",
      editor: { revision: 1, structureHash: `v1:sha256:${"a".repeat(64)}` },
      structure: buildTrainingPlanStructure([
        {
          draftId: "11111111-1111-4111-8111-111111111111",
          activityPlanId: null,
          activityCategory: "bike",
          offsetDays: 0,
          title: "Ride",
        },
      ]),
    };
    mocks.create.mockResolvedValue({ status: "stale", reason: "plan_revision" });
    const view = await renderReady(<TrainingPlanEditor planId={planId} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Local draft" } });
    mocks.plan = {
      ...mocks.plan,
      name: "Remote change",
      editor: { revision: 2, structureHash: "new-hash" },
    };
    view.rerender(<TrainingPlanEditor planId={planId} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByRole("alert");
    expect(mocks.create.mock.calls[0]?.[0].draft).toMatchObject({
      expectedRevision: 1,
      expectedStructureHash: `v1:sha256:${"a".repeat(64)}`,
      name: "Local draft",
    });
    expect(screen.getByRole("button", { name: "Reload saved plan" })).toBeTruthy();
  });

  it("does not settle an old owner's save into a different plan", async () => {
    let finishSave!: (value: object) => void;
    mocks.create.mockReturnValueOnce(
      new Promise((resolve) => {
        finishSave = resolve;
      }),
    );
    const onSaved = vi.fn();
    const view = await renderReady(<TrainingPlanEditor onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Old owner" } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    mocks.plan = {
      id: planId,
      name: "New owner",
      description: "",
      content_visibility: "private",
      structure: buildTrainingPlanStructure([
        {
          draftId: "11111111-1111-4111-8111-111111111111",
          activityPlanId: null,
          activityCategory: "bike",
          offsetDays: 0,
          title: "New ride",
        },
      ]),
      editor: { revision: 1, structureHash: "hash" },
    };
    view.rerender(<TrainingPlanEditor planId={planId} onSaved={onSaved} />);
    await act(async () =>
      finishSave({ status: "saved", planId: "99999999-9999-4999-8999-999999999999" }),
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "New owner");
  });

  it("searches bounded activity pages and exposes the existing cursor continuation", async () => {
    mocks.hasNextPage = true;
    await renderReady(<TrainingPlanEditor onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search owned activity plans"), {
      target: { value: "Long ride" },
    });
    expect(mocks.activitySearch).toHaveBeenLastCalledWith({
      ownerScope: "own",
      search: "Long ride",
      limit: 25,
    });
    fireEvent.click(screen.getByRole("button", { name: "Load more activity plans" }));
    expect(mocks.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("can select an activity from a later cursor page", async () => {
    mocks.hasNextPage = true;
    const earlierItems = Array.from(
      { length: 99 },
      (_, index): { id: string; name: string; activityCategory: string; metrics: [] } => ({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        name: `Owned activity ${index + 2}`,
        activityCategory: "bike",
        metrics: [],
      }),
    );
    mocks.extraPages = [
      earlierItems.slice(0, 24),
      earlierItems.slice(24, 49),
      earlierItems.slice(49, 74),
      earlierItems.slice(74),
    ].map((items) => ({ items }));
    const view = await renderReady(<TrainingPlanEditor onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Paged plan" } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    fireEvent.click(screen.getByRole("button", { name: "Load more activity plans" }));
    const id = "99999999-9999-4999-8999-999999999999";
    mocks.extraPages = [
      ...mocks.extraPages,
      {
        items: [
          { id, name: "Activity beyond the first 100", activityCategory: "run", metrics: [] },
        ],
      },
    ];
    view.rerender(<TrainingPlanEditor onSaved={vi.fn()} />);
    expect(screen.getByLabelText("Activity plan").querySelectorAll("option")).toHaveLength(102);
    fireEvent.change(screen.getByLabelText("Activity plan"), { target: { value: id } });
    mocks.extraPages = [];
    fireEvent.change(screen.getByLabelText("Search owned activity plans"), {
      target: { value: "Another search" },
    });
    expect(screen.getByLabelText("Activity plan")).toHaveProperty("value", id);
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create.mock.calls[0]?.[0].draft.structure.sessions[0].activity_plan_id).toBe(id);
  });

  it("allows correction after a definitive server rejection instead of retaining an uncertain intent", async () => {
    mocks.create
      .mockRejectedValueOnce(
        Object.assign(new Error("Rejected"), { data: { code: "BAD_REQUEST" } }),
      )
      .mockResolvedValueOnce({ status: "saved", planId });
    await renderReady(<TrainingPlanEditor onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Rejected draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    expect((await screen.findByRole("alert")).textContent).toContain("save was rejected");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Corrected" } });
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[1]?.[0].draft.name).toBe("Corrected");
    expect(mocks.create.mock.calls[1]?.[0].operationId).not.toBe(
      mocks.create.mock.calls[0]?.[0].operationId,
    );
  });
  it.each([
    0, 23,
  ])("uses the local calendar day for today's start date at hour %s", async (hour) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(2026, 2, 8, hour, 30));
      await renderReady(<TrainingPlanEditor onSaved={vi.fn()} />);
      expect(screen.getByLabelText("Start date")).toHaveProperty("value", "2026-03-08");
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    "private",
    "followers",
    "public",
  ])("round-trips %s visibility through create and the same edit owner", async (visibility) => {
    const view = await renderReady(<TrainingPlanEditor onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Visibility plan" } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    fireEvent.change(screen.getByLabelText("Visibility"), { target: { value: visibility } });
    expect(mocks.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    const saved = mocks.create.mock.calls[0]?.[0].draft;
    expect(saved.contentVisibility).toBe(visibility);
    view.unmount();
    mocks.plan = {
      ...saved,
      id: planId,
      content_visibility: saved.contentVisibility,
      editor: { revision: 1, structureHash: `v1:sha256:${"a".repeat(64)}` },
    };
    await renderReady(<TrainingPlanEditor planId={planId} onSaved={vi.fn()} />);
    expect((screen.getByLabelText("Visibility") as HTMLSelectElement).value).toBe(visibility);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[1]?.[0]).toMatchObject({
      kind: "update",
      draft: { planId, contentVisibility: visibility },
    });
  });

  it("discards unsaved create values immediately on Cancel", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await renderReady(<TrainingPlanEditor onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Keep changes" } });
    fireEvent.change(screen.getByLabelText("Visibility"), { target: { value: "public" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel changes" }));
    expect(confirm).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Visibility") as HTMLSelectElement).value).toBe("private");
    expect(mocks.create).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
  it("discards unsaved edit values on Cancel without modifying the persisted entity", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    mocks.plan = {
      id: planId,
      name: "Saved plan",
      description: "Saved notes",
      content_visibility: "followers",
      structure: buildTrainingPlanStructure([
        {
          draftId: "11111111-1111-4111-8111-111111111111",
          activityPlanId: null,
          activityCategory: "bike",
          offsetDays: 0,
          title: "Ride",
        },
      ]),
      editor: { revision: 1, structureHash: `v1:sha256:${"a".repeat(64)}` },
    };
    await renderReady(<TrainingPlanEditor planId={planId} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Visibility"), { target: { value: "public" } });
    fireEvent.change(screen.getByLabelText("Day offset"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel changes" }));
    expect(confirm).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Visibility") as HTMLSelectElement).value).toBe("followers");
    expect((screen.getByLabelText("Day offset") as HTMLInputElement).value).toBe("0");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("requests the authoritative draft projection and saves only persisted identity", async () => {
    const onSaved = vi.fn();
    await renderReady(<TrainingPlanEditor onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Base plan" } });
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-08-02" } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));

    expect(screen.getByRole("status").textContent).toContain("Fitness");
    expect(screen.getByRole("status").textContent).toContain("Fatigue");
    expect(screen.getByRole("status").textContent).toContain("Form");
    expect(screen.getByRole("status").textContent).toContain("Readiness—");

    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(planId));
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "create",
        basePublishedRevision: 4,
      }),
    );
    expect(mocks.create.mock.calls[0]?.[0]).not.toHaveProperty("plannedSessions");
  });

  it("keeps the selected category when automatic selection is chosen and allows changing it", async () => {
    await renderReady(<TrainingPlanEditor onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Automatic plan" } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    fireEvent.change(screen.getByLabelText("Activity plan"), { target: { value: "" } });

    const category = screen.getByLabelText("Activity category") as HTMLSelectElement;
    expect(category.value).toBe("bike");
    fireEvent.change(category, { target: { value: "run" } });
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create.mock.calls.at(-1)?.[0]).toMatchObject({
      draft: {
        structure: {
          sessions: [{ activity_plan_id: null, demand: { activity_category: "run" } }],
        },
      },
    });
  });

  it("does not turn a blank day offset into zero or submit the prior valid draft", async () => {
    await renderReady(<TrainingPlanEditor onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Offset plan" } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    fireEvent.change(screen.getByLabelText("Day offset"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));

    expect(screen.getByRole("alert").textContent).toContain("day offset of zero or greater");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("retries a lost save response with the same payload and no new preview", async () => {
    mocks.create
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockRejectedValueOnce(
        Object.assign(new Error("Authentication expired on replay"), {
          data: { code: "UNAUTHORIZED" },
        }),
      )
      .mockResolvedValueOnce({ status: "saved", planId });
    const onSaved = vi.fn();
    await renderReady(<TrainingPlanEditor onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Retry plan" } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));

    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    await screen.findByText(/outcome is unknown/i);
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Retry plan");
    expect((screen.getByLabelText("Name") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Visibility") as HTMLSelectElement).disabled).toBe(true);
    const firstPayload = mocks.create.mock.calls[0]?.[0];
    expect(mocks.preview).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
    await screen.findByText(/Authentication expired on replay/);
    expect(screen.getByLabelText("Name")).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(planId));
    expect(mocks.create.mock.calls[1]?.[0]).toBe(firstPayload);
    expect(mocks.create.mock.calls[2]?.[0]).toBe(firstPayload);
    expect(mocks.preview).toHaveBeenCalledTimes(1);
  });

  it("retains an acknowledged request when refreshing reads fails", async () => {
    mocks.invalidate.mockRejectedValueOnce(
      Object.assign(new Error("Refresh rejected"), { data: { code: "BAD_REQUEST" } }),
    );
    const onSaved = vi.fn();
    await renderReady(<TrainingPlanEditor onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Saved intent" } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    await screen.findByText(/plan was saved/);
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.preview).toHaveBeenCalledTimes(1);
  });

  it("preserves the draft, refreshes, re-simulates, and visibly retries a stale conflict", async () => {
    mocks.create
      .mockResolvedValueOnce({ status: "stale", reason: "state_revision" })
      .mockResolvedValueOnce({ status: "saved", planId });
    const onSaved = vi.fn();
    const view = await renderReady(<TrainingPlanEditor onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Retained draft" } });
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-08-02" } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));

    expect((await screen.findByRole("alert")).textContent).toContain("changes are preserved");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Retained draft");
    expect(mocks.refetchBaseline).toHaveBeenCalled();

    mocks.baselineQuery = baselineQuery(5, 55, 45);
    view.rerender(<TrainingPlanEditor onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry validation" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(planId));
    expect(mocks.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "create", basePublishedRevision: 4 }),
    );
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Retained draft");
  });

  it("announces loading, error, and unavailable authoritative preview states", async () => {
    mocks.previewState = "loading";
    const view = await renderReady(<TrainingPlanEditor onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Base plan" } });
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    expect(screen.getByRole("status").textContent).toContain("Validating this plan");

    mocks.previewState = "error";
    view.rerender(<TrainingPlanEditor onSaved={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toContain("Projection could not be loaded");
    expect(screen.getByRole("button", { name: "Retry projection" })).toBeTruthy();

    mocks.previewState = "unavailable";
    view.rerender(<TrainingPlanEditor onSaved={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toContain("Projection unavailable");
  });

  it("explains stale projection state when the snapshot import failed", async () => {
    const baseline = baselineQuery(4, 40, 30);
    mocks.baselineQuery = {
      ...baseline,
      data: {
        ...baseline.data,
        status: { ...baseline.data.status, freshness: "stale", importStatus: "failed" },
      },
    };

    await renderReady(<TrainingPlanEditor onSaved={vi.fn()} />);

    expect(screen.getByRole("status").textContent).toContain("activity history import failed");
  });
});

function baselineQuery(revision: number | null, longTermLoad: number, recentLoad: number) {
  return {
    data: {
      contractVersion: "athlete-read-model-v1",
      profileId: "44444444-4444-4444-8444-444444444444",
      asOf: "2026-08-01T00:00:00.000Z",
      publishedRevision: revision,
      algorithmVersion: revision === null ? null : "athlete-state-projection-v1",
      status: {
        freshness: revision === null ? "unavailable" : "fresh",
        rebuildStatus: revision === null ? "unavailable" : "fresh",
        importStatus: "complete" as const,
      },
      currentBaseline: {
        planningTimezone: "UTC",
        currentPlanningDate: "2026-08-01",
        baseline:
          revision === null
            ? null
            : {
                contractVersion: "athlete-state-projection-v1",
                athleteId: "44444444-4444-4444-8444-444444444444",
                stateRevision: revision,
                asOf: "2026-08-01T00:00:00.000Z",
                longTermLoad,
                recentLoad,
                loadBalance: longTermLoad - recentLoad,
                evidenceConfidence: 0.8,
                capabilities: [],
                athleteAgeYears: 35,
              },
      },
    },
    error: null,
    isLoading: false,
    refetch: mocks.refetchBaseline,
  };
}
