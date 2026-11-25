import AsyncStorage from "@react-native-async-storage/async-storage";
import { freezePlannedSessionScenarioOperation } from "@repo/api/client";
import { randomUUID } from "expo-crypto";
import React from "react";
import { act, cleanup, renderNative, waitFor } from "../../../test/render-native";
import { SessionScenarioPreview } from "../SessionScenarioPreview";

const initialMaestroE2E = process.env.EXPO_PUBLIC_MAESTRO_E2E;

const mocks = {
  actorId: "00000000-0000-4000-8000-000000000001",
  invalidations: {
    activityPlans: jest.fn(),
    calendar: jest.fn(),
    ledger: jest.fn(),
    plannedSessions: jest.fn(),
    state: jest.fn(),
  },
  previewInput: undefined as unknown,
  previewInputs: [] as unknown[],
  preview: { data: undefined as unknown, isError: false, isLoading: false, refetch: jest.fn() },
  apply: jest.fn(),
  applyPending: false,
};

jest.mock("@/lib/api", () => ({
  api: {
    useUtils: () => ({
      athleteIntelligence: { getReadModel: { invalidate: mocks.invalidations.state } },
      activityPlans: { invalidate: mocks.invalidations.activityPlans },
      calendar: { invalidate: mocks.invalidations.calendar },
      plannedSessions: { invalidate: mocks.invalidations.plannedSessions },
      trainingPlans: { getPlanningLedger: { invalidate: mocks.invalidations.ledger } },
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
        useMutation: () => ({ isPending: mocks.applyPending, mutateAsync: mocks.apply }),
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
    mocks.applyPending = false;
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
    delete process.env.EXPO_PUBLIC_MAESTRO_E2E;
  });

  afterEach(async () => {
    await cleanup();
    if (initialMaestroE2E === undefined) delete process.env.EXPO_PUBLIC_MAESTRO_E2E;
    else process.env.EXPO_PUBLIC_MAESTRO_E2E = initialMaestroE2E;
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
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    expect(mocks.apply.mock.calls[0]?.[0]).toMatchObject({
      operationId: "00000000000040008000000000000001",
    });
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

  it("keeps a hydrated receipt actionable through an unavailable preview without auto-submitting", async () => {
    const recoveredSessionId = "00000000-0000-4000-8000-000000000010";
    const receipt = freezePlannedSessionScenarioOperation({
      actorId: "00000000-0000-4000-8000-000000000001",
      expectedPreviewFingerprint: `v1:sha256:${"b".repeat(64)}`,
      operationId: "00000000000040008000000000000009",
      preview: {
        expectedPlanRevision: 5,
        expectedSessionRevision: 3,
        expectedStateRevision: 7,
        scenario: { kind: "less", targetDurationSeconds: 1200 },
        sessionId: recoveredSessionId,
      },
    });
    mocks.preview = {
      data: { status: "unavailable", reason: "session_not_scheduled" },
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    };
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(JSON.stringify(receipt));
    mocks.apply.mockResolvedValue({ status: "applied", action: "repointed" });

    const screen = await renderNative(
      <SessionScenarioPreview {...props} session={{ ...props.session, id: recoveredSessionId }} />,
    );
    await waitFor(() => expect(screen.getByTestId("session-scenario-retry-apply")).toBeTruthy());
    expect(screen.getByText("Previous change needs confirmation")).toBeTruthy();
    expect(
      screen.getByText(
        "This saved change may already have been applied. Check or retry it before starting another change. The comparison below is read-only.",
      ),
    ).toBeTruthy();
    const previewChildren = screen.getByTestId("session-scenario-preview").children;
    const scenarioChoices = screen.getByTestId("session-scenario-as_planned").parent;
    if (!scenarioChoices) throw new Error("Scenario choices must have a parent.");
    expect(previewChildren.indexOf(screen.getByTestId("session-scenario-recovery"))).toBeLessThan(
      previewChildren.indexOf(scenarioChoices),
    );
    expect(mocks.apply).not.toHaveBeenCalled();
    await act(async () => screen.getByTestId("session-scenario-retry-apply").props.onPress());
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(1));
    expect(mocks.apply).toHaveBeenLastCalledWith(receipt.request);
  });

  it("announces a hydrated pending saved change without offering another retry", async () => {
    const recoveredSessionId = "00000000-0000-4000-8000-000000000010";
    const receipt = freezePlannedSessionScenarioOperation({
      actorId: "00000000-0000-4000-8000-000000000001",
      expectedPreviewFingerprint: `v1:sha256:${"b".repeat(64)}`,
      operationId: "00000000000040008000000000000009",
      preview: {
        expectedPlanRevision: 5,
        expectedSessionRevision: 3,
        expectedStateRevision: 7,
        scenario: { kind: "less", targetDurationSeconds: 1200 },
        sessionId: recoveredSessionId,
      },
    });
    mocks.preview = {
      data: { status: "unavailable", reason: "session_not_scheduled" },
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    };
    mocks.applyPending = true;
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(JSON.stringify(receipt));

    const screen = await renderNative(
      <SessionScenarioPreview {...props} session={{ ...props.session, id: recoveredSessionId }} />,
    );
    await waitFor(() => expect(screen.getByText("Checking saved change")).toBeTruthy());
    const status = screen.getByText(
      "Checking the saved change now. Wait for its result before trying anything else. The comparison below is read-only.",
    );
    expect(status.props.accessibilityLiveRegion).toBe("polite");
    expect(screen.getByTestId("session-scenario-retry-apply").props.disabled).toBe(true);
    expect(screen.queryByText("Check or retry this change")).toBeNull();
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("does not render the retry boundary marker when E2E mode is disabled", async () => {
    const recoveredSessionId = "00000000-0000-4000-8000-000000000010";
    const receipt = freezePlannedSessionScenarioOperation({
      actorId: "00000000-0000-4000-8000-000000000001",
      expectedPreviewFingerprint: `v1:sha256:${"b".repeat(64)}`,
      operationId: "00000000000040008000000000000009",
      preview: {
        expectedPlanRevision: 5,
        expectedSessionRevision: 3,
        expectedStateRevision: 7,
        scenario: { kind: "less", targetDurationSeconds: 1200 },
        sessionId: recoveredSessionId,
      },
    });
    mocks.preview = {
      data: { status: "unavailable", reason: "session_not_scheduled" },
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    };
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(JSON.stringify(receipt));

    const screen = await renderNative(
      <SessionScenarioPreview {...props} session={{ ...props.session, id: recoveredSessionId }} />,
    );
    await waitFor(() => expect(screen.getByTestId("session-scenario-retry-apply")).toBeTruthy());
    expect(screen.queryByTestId("e2e-session-scenario-retry-boundary-idle")).toBeNull();
  });

  it("retries the same recovered operation after a lost acknowledgement without auto-submitting", async () => {
    const recoveredSession = {
      ...props.session,
      id: "00000000-0000-4000-8000-000000000010",
    };
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
    mocks.apply
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({ status: "applied", action: "repointed" });
    process.env.EXPO_PUBLIC_MAESTRO_E2E = "1";
    const initial = await renderNative(
      <SessionScenarioPreview {...props} session={recoveredSession} />,
    );
    await waitFor(() =>
      expect(initial.getByTestId("session-scenario-apply").props.disabled).toBe(false),
    );
    await act(async () => initial.getByTestId("session-scenario-apply").props.onPress());
    await act(async () => initial.getByTestId("session-scenario-confirm-apply").props.onPress());
    await waitFor(() => expect(initial.getByTestId("session-scenario-retry-apply")).toBeTruthy());
    expect(
      initial.getByText("We could not confirm the result. Check or retry with the same operation."),
    ).toBeTruthy();
    const firstRequest = mocks.apply.mock.calls[0]?.[0];
    expect(firstRequest).toMatchObject({
      expectedPreviewFingerprint: `v1:sha256:${"a".repeat(64)}`,
      operationId: "00000000000040008000000000000001",
      preview: { sessionId: recoveredSession.id },
    });
    expect([...stored.values()]).toEqual([
      expect.stringContaining(`"operationId":"${firstRequest?.operationId}"`),
    ]);

    await act(async () => initial.unmount());
    mocks.preview = {
      data: { status: "unavailable", reason: "session_not_scheduled" },
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    };
    const recovered = await renderNative(
      <SessionScenarioPreview {...props} session={recoveredSession} />,
    );
    await waitFor(() => expect(recovered.getByTestId("session-scenario-retry-apply")).toBeTruthy());
    expect(recovered.getByTestId("session-scenario-retry-apply").props.disabled).toBe(false);
    expect(recovered.getByTestId("e2e-session-scenario-retry-boundary-idle")).toBeTruthy();
    expect(mocks.apply).toHaveBeenCalledTimes(1);

    await act(async () => recovered.getByTestId("session-scenario-retry-apply").props.onPress());
    await waitFor(() =>
      expect(recovered.getByTestId("e2e-session-scenario-retry-boundary-dispatched")).toBeTruthy(),
    );
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(2));
    expect(mocks.apply).toHaveBeenLastCalledWith(firstRequest);
    await waitFor(() => expect(recovered.getByText("Applied: repointed.")).toBeTruthy());
  });

  it("retains a real retry dispatch marker through a parent fallback remount", async () => {
    const recoveredSession = {
      ...props.session,
      id: "00000000-0000-4000-8000-000000000012",
    };
    const receipt = freezePlannedSessionScenarioOperation({
      actorId: mocks.actorId,
      expectedPreviewFingerprint: `v1:sha256:${"d".repeat(64)}`,
      operationId: "00000000000040008000000000000011",
      preview: {
        expectedPlanRevision: 5,
        expectedSessionRevision: 3,
        expectedStateRevision: 7,
        scenario: { kind: "less", targetDurationSeconds: 1200 },
        sessionId: recoveredSession.id,
      },
    });
    const stored = new Map<string, string>();
    const storageKey = `gradientpeak:planned-session-scenario:v1:${recoveredSession.profileId}:${recoveredSession.id}`;
    stored.set(storageKey, JSON.stringify(receipt));
    jest.mocked(AsyncStorage.getItem).mockImplementation(async (key) => stored.get(key) ?? null);
    jest.mocked(AsyncStorage.removeItem).mockImplementation(async (key) => {
      stored.delete(key);
    });
    mocks.preview = {
      data: { status: "unavailable", reason: "session_not_scheduled" },
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    };
    mocks.apply.mockResolvedValue({ status: "applied", action: "repointed" });
    process.env.EXPO_PUBLIC_MAESTRO_E2E = "1";

    function ParentHarness() {
      const [boundary, setBoundary] = React.useState<
        | Parameters<
            NonNullable<
              React.ComponentProps<typeof SessionScenarioPreview>["onE2ERetryBoundaryChange"]
            >
          >[0]
        | null
      >(null);
      const [showPreview, setShowPreview] = React.useState(true);
      if (!showPreview)
        return React.createElement(RemountFallback, {
          onRestore: () => setShowPreview(true),
        });
      return (
        <SessionScenarioPreview
          {...props}
          e2eRetryBoundary={boundary}
          onE2ERetryBoundaryChange={setBoundary}
          onKnownOutcomeChange={(outcome) => {
            if (outcome) setShowPreview(false);
          }}
          session={recoveredSession}
        />
      );
    }

    function RemountFallback({ onRestore }: { onRestore: () => void }) {
      React.useEffect(onRestore, [onRestore]);
      return React.createElement("View", { testID: "scenario-preview-fallback" });
    }

    const screen = await renderNative(<ParentHarness />);
    await waitFor(() => expect(screen.getByTestId("session-scenario-retry-apply")).toBeTruthy());
    await act(async () => screen.getByTestId("session-scenario-retry-apply").props.onPress());
    await waitFor(() =>
      expect(screen.getByTestId("e2e-session-scenario-retry-boundary-dispatched")).toBeTruthy(),
    );
    await waitFor(() => expect(mocks.invalidations.plannedSessions).toHaveBeenCalled());
  });

  it("returns to a fresh idle marker when actor A revisits after actor B", async () => {
    const recoveredSession = {
      ...props.session,
      id: "00000000-0000-4000-8000-000000000014",
    };
    const receipt = freezePlannedSessionScenarioOperation({
      actorId: mocks.actorId,
      expectedPreviewFingerprint: `v1:sha256:${"e".repeat(64)}`,
      operationId: "00000000000040008000000000000013",
      preview: {
        expectedPlanRevision: 5,
        expectedSessionRevision: 3,
        expectedStateRevision: 7,
        scenario: { kind: "less", targetDurationSeconds: 1200 },
        sessionId: recoveredSession.id,
      },
    });
    const stored = new Map<string, string>([
      [
        `gradientpeak:planned-session-scenario:v1:${recoveredSession.profileId}:${recoveredSession.id}`,
        JSON.stringify(receipt),
      ],
    ]);
    jest.mocked(AsyncStorage.getItem).mockImplementation(async (key) => stored.get(key) ?? null);
    jest.mocked(AsyncStorage.removeItem).mockImplementation(async (key) => {
      stored.delete(key);
    });
    mocks.preview = {
      data: { status: "unavailable", reason: "session_not_scheduled" },
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    };
    mocks.apply.mockResolvedValue({ status: "applied", action: "repointed" });
    process.env.EXPO_PUBLIC_MAESTRO_E2E = "1";

    const screen = await renderNative(
      <SessionScenarioPreview {...props} session={recoveredSession} />,
    );
    await waitFor(() => expect(screen.getByTestId("session-scenario-retry-apply")).toBeTruthy());
    await act(async () => screen.getByTestId("session-scenario-retry-apply").props.onPress());
    await waitFor(() =>
      expect(screen.getByTestId("e2e-session-scenario-retry-boundary-dispatched")).toBeTruthy(),
    );

    const actorA = mocks.actorId;
    mocks.actorId = "00000000-0000-4000-8000-000000000015";
    await act(async () =>
      screen.rerender(<SessionScenarioPreview {...props} session={recoveredSession} />),
    );
    await waitFor(() =>
      expect(screen.getByTestId("e2e-session-scenario-retry-boundary-idle")).toBeTruthy(),
    );

    mocks.actorId = actorA;
    await act(async () =>
      screen.rerender(<SessionScenarioPreview {...props} session={recoveredSession} />),
    );
    await waitFor(() =>
      expect(screen.getByTestId("e2e-session-scenario-retry-boundary-idle")).toBeTruthy(),
    );
  });

  it("replaces an unknown outcome with one pending recovery announcement until retry settles", async () => {
    let resolveRetry!: (result: { action: string; status: "applied" }) => void;
    const retryResult = new Promise<{ action: string; status: "applied" }>((resolve) => {
      resolveRetry = resolve;
    });
    mocks.preview = {
      data: availablePreview(),
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    };
    mocks.apply
      .mockRejectedValueOnce(new Error("response lost"))
      .mockImplementationOnce(() => retryResult);
    const screen = await renderNative(<SessionScenarioPreview {...props} />);
    await waitFor(() =>
      expect(screen.getByTestId("session-scenario-apply").props.disabled).toBe(false),
    );
    await act(async () => screen.getByTestId("session-scenario-apply").props.onPress());
    await act(async () => screen.getByTestId("session-scenario-confirm-apply").props.onPress());
    await waitFor(() =>
      expect(
        screen.getByText(
          "We could not confirm the result. Check or retry with the same operation.",
        ),
      ).toBeTruthy(),
    );

    await act(async () => screen.getByTestId("session-scenario-retry-apply").props.onPress());
    mocks.applyPending = true;
    await act(async () => screen.rerender(<SessionScenarioPreview {...props} />));
    const pendingStatus = screen.getByText(
      "Checking the saved change now. Wait for its result before trying anything else. The comparison below is read-only.",
    );
    expect(pendingStatus.props.accessibilityLiveRegion).toBe("polite");
    expect(
      screen.queryByText(
        "We could not confirm the result. Check or retry with the same operation.",
      ),
    ).toBeNull();
    expect(screen.getByTestId("session-scenario-retry-apply").props.disabled).toBe(true);

    mocks.applyPending = false;
    await act(async () => resolveRetry({ status: "applied", action: "repointed" }));
    await act(async () => screen.rerender(<SessionScenarioPreview {...props} />));
    await waitFor(() => expect(screen.getByText("Applied: repointed.")).toBeTruthy());
  });

  it("records a guarded E2E retry boundary without dispatching a second pending submission", async () => {
    const recoveredSessionId = "00000000-0000-4000-8000-000000000010";
    const receipt = freezePlannedSessionScenarioOperation({
      actorId: "00000000-0000-4000-8000-000000000001",
      expectedPreviewFingerprint: `v1:sha256:${"b".repeat(64)}`,
      operationId: "00000000000040008000000000000009",
      preview: {
        expectedPlanRevision: 5,
        expectedSessionRevision: 3,
        expectedStateRevision: 7,
        scenario: { kind: "less", targetDurationSeconds: 1200 },
        sessionId: recoveredSessionId,
      },
    });
    let resolveApply: (value: { status: "applied"; action: "repointed" }) => void = () => undefined;
    mocks.preview = {
      data: { status: "unavailable", reason: "session_not_scheduled" },
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    };
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(JSON.stringify(receipt));
    mocks.apply.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveApply = resolve;
        }),
    );
    process.env.EXPO_PUBLIC_MAESTRO_E2E = "1";

    const screen = await renderNative(
      <SessionScenarioPreview {...props} session={{ ...props.session, id: recoveredSessionId }} />,
    );
    await waitFor(() => expect(screen.getByTestId("session-scenario-retry-apply")).toBeTruthy());
    await act(async () => screen.getByTestId("session-scenario-retry-apply").props.onPress());
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(1));
    await act(async () => screen.getByTestId("session-scenario-retry-apply").props.onPress());
    await waitFor(() =>
      expect(screen.getByTestId("e2e-session-scenario-retry-boundary-guarded")).toBeTruthy(),
    );
    expect(mocks.apply).toHaveBeenCalledTimes(1);

    await act(async () => resolveApply({ status: "applied", action: "repointed" }));
  });

  it("hands a durable outcome to a stable boundary for a same-actor remount", async () => {
    mocks.preview = {
      data: availablePreview(),
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    };
    mocks.apply.mockResolvedValue({ status: "applied", action: "repointed" });
    const onKnownOutcomeChange = jest.fn();
    const screen = await renderNative(
      <SessionScenarioPreview {...props} onKnownOutcomeChange={onKnownOutcomeChange} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("session-scenario-apply").props.disabled).toBe(false),
    );
    await act(async () => screen.getByTestId("session-scenario-apply").props.onPress());
    await act(async () => screen.getByTestId("session-scenario-confirm-apply").props.onPress());
    await waitFor(() =>
      expect(onKnownOutcomeChange).toHaveBeenCalledWith({
        actorId: mocks.actorId,
        message: "Applied: repointed.",
      }),
    );
    const knownOutcome = onKnownOutcomeChange.mock.calls.at(-1)?.[0];
    await act(async () => screen.rerender(<React.Fragment key="unmounted" />));
    await act(async () =>
      screen.rerender(<SessionScenarioPreview {...props} knownOutcome={knownOutcome} />),
    );
    expect(screen.getByText("Applied: repointed.")).toBeTruthy();
  });

  it("does not show actor A's known outcome to actor B on the same session", async () => {
    const knownOutcome = {
      actorId: "00000000-0000-4000-8000-000000000001",
      message: "Applied: repointed.",
    };
    const screen = await renderNative(
      <SessionScenarioPreview {...props} knownOutcome={knownOutcome} />,
    );
    expect(screen.getByText(knownOutcome.message)).toBeTruthy();

    mocks.actorId = "00000000-0000-4000-8000-000000000002";
    await act(async () =>
      screen.rerender(<SessionScenarioPreview {...props} knownOutcome={knownOutcome} />),
    );
    expect(screen.queryByText(knownOutcome.message)).toBeNull();
  });

  it("clears a prior known outcome before arming the next frozen operation", async () => {
    mocks.preview = {
      data: availablePreview(),
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    };
    let resolveApply: (value: unknown) => void = () => undefined;
    mocks.apply.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveApply = resolve;
        }),
    );
    const onKnownOutcomeChange = jest.fn();
    const knownOutcome = { actorId: mocks.actorId, message: "Applied: repointed." };
    const screen = await renderNative(
      <SessionScenarioPreview
        {...props}
        knownOutcome={knownOutcome}
        onKnownOutcomeChange={onKnownOutcomeChange}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("session-scenario-apply").props.disabled).toBe(false),
    );
    await act(async () => screen.getByTestId("session-scenario-apply").props.onPress());
    await act(async () => screen.getByTestId("session-scenario-confirm-apply").props.onPress());
    expect(onKnownOutcomeChange).toHaveBeenCalledWith(null);
    expect(screen.queryByText(knownOutcome.message)).toBeNull();
    await act(async () => resolveApply({ status: "applied", action: "repointed" }));
  });

  it.each([
    "calendar",
    "ledger",
  ] as const)("updates the stable known outcome when %s refresh invalidation fails", async (cache) => {
    mocks.preview = {
      data: availablePreview(),
      isError: false,
      isLoading: false,
      refetch: jest.fn(),
    };
    mocks.apply.mockResolvedValue({ status: "applied", action: "repointed" });
    mocks.invalidations[cache].mockRejectedValueOnce(new Error("refresh unavailable"));
    const onKnownOutcomeChange = jest.fn();
    const screen = await renderNative(
      <SessionScenarioPreview {...props} onKnownOutcomeChange={onKnownOutcomeChange} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("session-scenario-apply").props.disabled).toBe(false),
    );
    await act(async () => screen.getByTestId("session-scenario-apply").props.onPress());
    await act(async () => screen.getByTestId("session-scenario-confirm-apply").props.onPress());
    await waitFor(() =>
      expect(onKnownOutcomeChange).toHaveBeenLastCalledWith({
        actorId: mocks.actorId,
        message: "Applied: repointed. The screen refresh failed; reopen this session.",
      }),
    );
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
    await waitFor(() => expect(mocks.invalidations.activityPlans).toHaveBeenCalledTimes(1));
    expect(mocks.invalidations.ledger).toHaveBeenCalledTimes(1);

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
