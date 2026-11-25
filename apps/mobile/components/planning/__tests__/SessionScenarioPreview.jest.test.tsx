import React from "react";
import { act, renderNative } from "../../../test/render-native";
import { SessionScenarioPreview } from "../SessionScenarioPreview";

const mocks = {
  previewInput: undefined as unknown,
  previewInputs: [] as unknown[],
  preview: { data: undefined, isError: false, isLoading: false, refetch: jest.fn() },
  apply: jest.fn(),
};

jest.mock("@/lib/api", () => ({
  api: {
    useUtils: () => ({
      athleteIntelligence: { getReadModel: { invalidate: jest.fn() } },
      activityPlans: { invalidate: jest.fn() },
      calendar: { invalidate: jest.fn() },
      plannedSessions: { invalidate: jest.fn() },
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
  useAuth: () => ({ user: { id: "00000000-0000-4000-8000-000000000001" } }),
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

  beforeEach(() => {
    mocks.previewInput = undefined;
    mocks.previewInputs = [];
    mocks.preview = { data: undefined, isError: false, isLoading: false, refetch: jest.fn() };
    mocks.apply = jest.fn();
  });

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
});
