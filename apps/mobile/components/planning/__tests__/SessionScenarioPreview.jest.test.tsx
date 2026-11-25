import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import React from "react";
import { act, renderNative, waitFor } from "../../../test/render-native";
import { SessionScenarioPreview } from "../SessionScenarioPreview";

const mocks = {
  actorId: "00000000-0000-4000-8000-000000000001",
  invalidations: {
    activityPlans: jest.fn(),
    calendar: jest.fn(),
    plannedSessions: jest.fn(),
    state: jest.fn(),
  },
  previewInput: undefined as unknown,
  previewInputs: [] as unknown[],
  preview: { data: undefined as unknown, isError: false, isLoading: false, refetch: jest.fn() },
  apply: jest.fn(),
};

jest.mock("@/lib/api", () => ({
  api: {
    useUtils: () => ({
      athleteIntelligence: { getReadModel: { invalidate: mocks.invalidations.state } },
      activityPlans: { invalidate: mocks.invalidations.activityPlans },
      calendar: { invalidate: mocks.invalidations.calendar },
      plannedSessions: { invalidate: mocks.invalidations.plannedSessions },
    }),
    activityPlans: {
      list: {
        useInfiniteQuery: () => ({
          data: { pages: [{ items: [{ id: "substitute", name: "Substitute" }] }] },
          fetchNextPage: jest.fn(),
          hasNextPage: false,
          isError: false,
          isFetchingNextPage: false,
          refetch: jest.fn(),
        }),
      },
    },
    athleteIntelligence: {
      getReadModel: {
        useQuery: () => ({
          data: { publishedState: { baseline: { stateRevision: 7 } } },
          isSuccess: true,
        }),
      },
    },
    plannedSessions: {
      previewScenario: {
        useQuery: (input: unknown) => {
          mocks.previewInput = input;
          mocks.previewInputs.push(input);
          return mocks.preview;
        },
      },
      applyScenario: {
        useMutation: () => ({ isPending: false, mutateAsync: mocks.apply }),
      },
    },
  },
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ user: mocks.actorId ? { id: mocks.actorId } : null }),
}));

jest.mock("@repo/ui/components/session-scenario-comparison", () => ({
  SessionScenarioComparison: () => React.createElement("ScenarioChart"),
}));

jest.mock("@/components/training-plan/modals/components/ActivitySelector", () => ({
  ActivitySelector: ({ onSelect }: { onSelect: (value: { id: string }) => void }) =>
    React.createElement("Pressable", {
      onPress: () => onSelect({ id: "substitute" }),
      testID: "select-substitute",
    }),
}));

describe("SessionScenarioPreview", () => {
  const props = {
    activityPlanRevision: 5,
    session: { id: "session-a", profileId: "profile-a", sessionRevision: 3 },
    timeZone: "UTC",
  };

  beforeEach(async () => {
    mocks.previewInput = undefined;
    mocks.previewInputs = [];
    mocks.preview = {
      data: undefined as unknown,
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    };
    mocks.apply = jest.fn();
    mocks.actorId = "00000000-0000-4000-8000-000000000001";
    Object.values(mocks.invalidations).forEach((invalidate) => {
      invalidate.mockReset();
    });
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
    jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
    jest.mocked(AsyncStorage.removeItem).mockResolvedValue(undefined);
    jest.mocked(AsyncStorage.getItem).mockClear();
    jest.mocked(AsyncStorage.setItem).mockClear();
    jest.mocked(AsyncStorage.removeItem).mockClear();
    await AsyncStorage.clear();
    jest.mocked(randomUUID).mockReturnValue("00000000-0000-4000-8000-000000000001");
  });

  function availablePreview(revision = 5) {
    return {
      status: "available" as const,
      previewFingerprint: `v1:sha256:${"a".repeat(64)}`,
      selectedSession: { id: "session-a", sessionRevision: 3, planningDate: "2026-11-26" },
      stateRevision: 7,
      horizon: { sessionCount: 2 },
      scenario: { kind: "as_planned" as const },
      baseline: {},
      alternative: {},
      provenance: { selectedPlan: { id: "current-plan", revision } },
    };
  }

  it("uses canonical revisions for as-planned, less, more, substitute, and skip previews", async () => {
    const screen = await renderNative(<SessionScenarioPreview {...props} />);
    expect(mocks.previewInput).toMatchObject({
      expectedPlanRevision: 5,
      expectedSessionRevision: 3,
      expectedStateRevision: 7,
      scenario: { kind: "as_planned" },
    });

    await act(async () => {
      (await screen.findByTestId("session-scenario-less")).props.onPress();
    });
    await act(async () => {
      screen.getByPlaceholderText("Enter an explicit duration").props.onChangeText("1800");
    });
    expect(mocks.previewInput).toMatchObject({
      scenario: { kind: "less", targetDurationSeconds: 1800 },
    });
    await act(async () => {
      (await screen.findByTestId("session-scenario-more")).props.onPress();
    });
    await act(async () => {
      screen.getByPlaceholderText("Enter an explicit duration").props.onChangeText("5400");
    });
    expect(mocks.previewInput).toMatchObject({
      scenario: { kind: "more", targetDurationSeconds: 5400 },
    });

    await act(async () => {
      (await screen.findByTestId("session-scenario-substitute")).props.onPress();
    });
    await act(async () => {
      (await screen.findByTestId("select-substitute")).props.onPress();
    });
    expect(mocks.previewInput).toMatchObject({
      scenario: { kind: "substitute", activityPlanId: "substitute" },
    });
    await act(async () => {
      (await screen.findByTestId("session-scenario-skip")).props.onPress();
    });
    expect(mocks.previewInput).toMatchObject({ scenario: { kind: "skip" } });
  });

  it("retains an invalid duration draft and does not create a scenario request", async () => {
    const screen = await renderNative(<SessionScenarioPreview {...props} />);
    await act(async () => {
      (await screen.findByTestId("session-scenario-less")).props.onPress();
    });
    await act(async () => {
      screen.getByPlaceholderText("Enter an explicit duration").props.onChangeText("0");
    });
    expect(screen.getByDisplayValue("0")).toBeTruthy();
    expect(screen.getByText(/Enter a positive target duration/)).toBeTruthy();
  });

  it("never submits a prior session draft during a session change", async () => {
    const screen = await renderNative(<SessionScenarioPreview {...props} />);
    await act(async () => {
      (await screen.findByTestId("session-scenario-more")).props.onPress();
    });
    await act(async () => {
      screen.getByPlaceholderText("Enter an explicit duration").props.onChangeText("5400");
    });
    await act(async () => {
      screen.rerender(
        <SessionScenarioPreview
          {...props}
          session={{ id: "session-b", profileId: "profile-a", sessionRevision: 4 }}
        />,
      );
    });
    expect(mocks.previewInputs).not.toContainEqual(
      expect.objectContaining({
        sessionId: "session-b",
        scenario: { kind: "more", targetDurationSeconds: 5400 },
      }),
    );
  });

  it("blocks confirmation until AsyncStorage recovery hydration completes", async () => {
    mocks.preview = {
      data: availablePreview(),
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    };
    let resolveRecovery: (value: null) => void = () => undefined;
    jest.mocked(AsyncStorage.getItem).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRecovery = resolve;
        }),
    );
    const screen = await renderNative(<SessionScenarioPreview {...props} />);

    expect(screen.getByTestId("session-scenario-apply").props.disabled).toBe(true);
    await act(async () => resolveRecovery(null));
    await waitFor(() =>
      expect(screen.getByTestId("session-scenario-apply").props.disabled).toBe(false),
    );
  });

  it("persists exactly one frozen operation when confirm is pressed twice during a deferred write", async () => {
    mocks.preview = {
      data: availablePreview(),
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    };
    let resolveWrite: () => void = () => undefined;
    jest.mocked(AsyncStorage.setItem).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
    );
    const screen = await renderNative(<SessionScenarioPreview {...props} />);
    await waitFor(() =>
      expect(screen.getByTestId("session-scenario-apply").props.disabled).toBe(false),
    );

    await act(async () => screen.getByTestId("session-scenario-apply").props.onPress());
    const confirm = screen.getByTestId("session-scenario-confirm-apply").props.onPress;
    await act(async () => {
      confirm();
      confirm();
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(jest.mocked(AsyncStorage.setItem).mock.calls[0]?.[1] ?? "{}")).toMatchObject({
      request: { operationId: "00000000000040008000000000000001" },
    });

    await act(async () => resolveWrite());
    await waitFor(() => expect(screen.getByTestId("session-scenario-retry-apply")).toBeTruthy());
  });

  it("does not arm actor A's delayed receipt for actor B while retaining A's recoverable receipt", async () => {
    mocks.preview = {
      data: availablePreview(),
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    };
    const stored = new Map<string, string>();
    let resolveWrite: () => void = () => undefined;
    jest.mocked(AsyncStorage.setItem).mockImplementation(
      (key, value) =>
        new Promise<void>((resolve) => {
          stored.set(key, value);
          resolveWrite = resolve;
        }),
    );
    jest.mocked(AsyncStorage.getItem).mockImplementation(async (key) => stored.get(key) ?? null);
    const screen = await renderNative(<SessionScenarioPreview {...props} />);
    await waitFor(() =>
      expect(screen.getByTestId("session-scenario-apply").props.disabled).toBe(false),
    );
    await act(async () => screen.getByTestId("session-scenario-apply").props.onPress());
    await act(async () => screen.getByTestId("session-scenario-confirm-apply").props.onPress());

    mocks.actorId = "00000000-0000-4000-8000-000000000002";
    await act(async () => screen.rerender(<SessionScenarioPreview {...props} />));
    await act(async () => resolveWrite());
    await waitFor(() => expect(screen.getByTestId("session-scenario-apply")).toBeTruthy());
    expect(screen.queryByTestId("session-scenario-retry-apply")).toBeNull();
    expect(
      JSON.parse(
        stored.get("gradientpeak:planned-session-scenario:v1:profile-a:session-a") ?? "{}",
      ),
    ).toMatchObject({ actorId: "00000000-0000-4000-8000-000000000001" });
  });

  it("fences actor A's late apply acknowledgement after actor B replaces the session identity", async () => {
    mocks.preview = {
      data: availablePreview(),
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    };
    const stored = new Map<string, string>();
    jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => {
      stored.set(key, value);
    });
    jest.mocked(AsyncStorage.getItem).mockImplementation(async (key) => stored.get(key) ?? null);
    jest.mocked(AsyncStorage.removeItem).mockImplementation(async (key) => {
      stored.delete(key);
    });
    let resolveApply: (value: unknown) => void = () => undefined;
    mocks.apply.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveApply = resolve;
        }),
    );
    const screen = await renderNative(<SessionScenarioPreview {...props} />);
    await waitFor(() =>
      expect(screen.getByTestId("session-scenario-apply").props.disabled).toBe(false),
    );
    await act(async () => screen.getByTestId("session-scenario-apply").props.onPress());
    await act(async () => screen.getByTestId("session-scenario-confirm-apply").props.onPress());
    await waitFor(() => expect(screen.getByTestId("session-scenario-retry-apply")).toBeTruthy());
    await act(async () => screen.getByTestId("session-scenario-retry-apply").props.onPress());

    mocks.actorId = "00000000-0000-4000-8000-000000000002";
    await act(async () => screen.rerender(<SessionScenarioPreview {...props} />));
    await act(async () => resolveApply({ status: "applied", action: "unchanged" }));
    expect(screen.queryByText(/Applied: unchanged/)).toBeNull();
    expect(stored.get("gradientpeak:planned-session-scenario:v1:profile-a:session-a")).toBeTruthy();
  });

  it("does not publish actor A's applied result after actor B replaces it during receipt cleanup", async () => {
    mocks.preview = {
      data: availablePreview(),
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    };
    mocks.apply.mockResolvedValue({ status: "applied", action: "repointed" });
    let resolveRemoval: () => void = () => undefined;
    jest.mocked(AsyncStorage.removeItem).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRemoval = resolve;
        }),
    );
    const screen = await renderNative(<SessionScenarioPreview {...props} />);
    await waitFor(() =>
      expect(screen.getByTestId("session-scenario-apply").props.disabled).toBe(false),
    );
    await act(async () => screen.getByTestId("session-scenario-apply").props.onPress());
    await act(async () => screen.getByTestId("session-scenario-confirm-apply").props.onPress());
    await waitFor(() => expect(screen.getByTestId("session-scenario-retry-apply")).toBeTruthy());
    await act(async () => screen.getByTestId("session-scenario-retry-apply").props.onPress());
    await waitFor(() => expect(AsyncStorage.removeItem).toHaveBeenCalledTimes(1));

    mocks.actorId = "00000000-0000-4000-8000-000000000002";
    await act(async () => screen.rerender(<SessionScenarioPreview {...props} />));
    await act(async () => resolveRemoval());
    expect(screen.queryByText(/Applied: repointed/)).toBeNull();
    expect(mocks.invalidations.plannedSessions).not.toHaveBeenCalled();
  });

  it("refreshes stale plan revisions without auto-applying and requires a newly frozen confirmation", async () => {
    mocks.preview = {
      data: availablePreview(1),
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    };
    mocks.apply.mockResolvedValue({ status: "stale", reason: "plan_revision" });
    jest
      .mocked(randomUUID)
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000002");
    const screen = await renderNative(
      <SessionScenarioPreview {...props} activityPlanRevision={1} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("session-scenario-apply").props.disabled).toBe(false),
    );
    await act(async () => screen.getByTestId("session-scenario-apply").props.onPress());
    await act(async () => screen.getByTestId("session-scenario-confirm-apply").props.onPress());
    await waitFor(() => expect(screen.getByTestId("session-scenario-retry-apply")).toBeTruthy());
    await act(async () => screen.getByTestId("session-scenario-retry-apply").props.onPress());
    await waitFor(() => expect(mocks.invalidations.activityPlans).toHaveBeenCalledTimes(1));

    mocks.preview = {
      data: availablePreview(2),
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    };
    await act(async () =>
      screen.rerender(<SessionScenarioPreview {...props} activityPlanRevision={2} />),
    );
    expect(mocks.previewInput).toMatchObject({ expectedPlanRevision: 2 });
    expect(screen.getByTestId("session-scenario-apply")).toBeTruthy();
    expect(screen.queryByTestId("session-scenario-retry-apply")).toBeNull();
    expect(mocks.apply).toHaveBeenCalledTimes(1);

    await act(async () => screen.getByTestId("session-scenario-apply").props.onPress());
    await act(async () => screen.getByTestId("session-scenario-confirm-apply").props.onPress());
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2));
    const writes = jest
      .mocked(AsyncStorage.setItem)
      .mock.calls.map(([, value]) => JSON.parse(value));
    expect(writes.at(-1)?.request.operationId).toBe("00000000000040008000000000000002");
    expect(writes[0]?.request.operationId).not.toBe(writes.at(-1)?.request.operationId);
  });
});
