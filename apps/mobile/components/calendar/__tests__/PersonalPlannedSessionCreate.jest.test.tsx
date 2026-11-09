import { Text } from "react-native";
import { fireEvent, renderNative, screen, waitFor } from "../../../test/render-native";

const createMock = jest.fn(async () => undefined);
const invalidateCalendarPageMock = jest.fn(async () => undefined);
const replaceMock = jest.fn();
let plannedSessionMutationOptions: {
  onConflict: () => Promise<unknown>;
} | null = null;
const activityPlanQueryInputs: unknown[] = [];
jest.mock("expo-crypto", () => ({ randomUUID: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }));
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: replaceMock }) }));
jest.mock("@repo/api/react", () => ({
  usePlannedSessionMutations: (options: { onConflict: () => Promise<unknown> }) => {
    plannedSessionMutationOptions = options;
    return {
      create: { isPending: false, mutateAsync: createMock },
    };
  },
}));
jest.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: (
    selector: (state: {
      profile: {
        id: string;
      };
    }) => unknown,
  ) => selector({ profile: { id: "11111111-1111-4111-8111-111111111111" } }),
}));
jest.mock("@/lib/api", () => ({
  api: {
    useUtils: () => ({ calendar: { page: { invalidate: invalidateCalendarPageMock } } }),
    activityPlans: {
      list: {
        useInfiniteQuery: (input: { ownerScope: "own" | "system" }) => {
          activityPlanQueryInputs.push(input);
          return {
            data: {
              pages: [
                {
                  items:
                    input.ownerScope === "own"
                      ? []
                      : [
                          {
                            id: "22222222-2222-4222-8222-222222222222",
                            name: "Tempo run",
                            activityCategory: "run",
                            activityPlanRevision: 6,
                            metrics: [
                              {
                                key: "elapsed_duration",
                                status: "available",
                                value: 1200,
                              },
                            ],
                            structure: {
                              version: 3,
                              activity_category: "run",
                              segments: [
                                {
                                  id: "33333333-3333-4333-8333-333333333333",
                                  role: "activity",
                                  name: "Run",
                                  intervals: [
                                    {
                                      id: "44444444-4444-4444-8444-444444444444",
                                      name: "Tempo",
                                      repetitions: 1,
                                      steps: [
                                        {
                                          type: "step",
                                          id: "55555555-5555-4555-8555-555555555555",
                                          name: "Work",
                                          duration: { type: "time", seconds: 1200 },
                                          targets: [{ type: "RPE", intensity: 7 }],
                                        },
                                      ],
                                    },
                                  ],
                                },
                              ],
                            },
                          },
                        ],
                  nextCursor: undefined,
                },
              ],
            },
            error: null,
            isError: false,
            isFetchingNextPage: false,
            isLoading: false,
            hasNextPage: false,
            fetchNextPage: jest.fn(),
            refetch: jest.fn(),
          };
        },
      },
    },
  },
}));
jest.mock("@/components/shared/ActivityPlanCard", () => ({
  ActivityPlanCard: ({
    plan,
  }: {
    plan: {
      name: string;
    };
  }) => <Text>{plan.name}</Text>,
}));
const { PersonalPlannedSessionCreate } = require("../PersonalPlannedSessionCreate");
describe("PersonalPlannedSessionCreate", () => {
  beforeEach(() => {
    createMock.mockClear();
    invalidateCalendarPageMock.mockClear();
    plannedSessionMutationOptions = null;
    activityPlanQueryInputs.length = 0;
  });
  it("schedules a selected system activity plan when the user has no owned plans", async () => {
    await renderNative(<PersonalPlannedSessionCreate planningDate="2026-08-16" />);
    await fireEvent.press(screen.getByText("Tempo run"));
    expect(screen.getByText("Selected activity plan: Tempo run")).toBeTruthy();
    expect(screen.getByText("Approximate duration: About 20 min")).toBeTruthy();
    expect(
      screen.getByTestId("catalog-activity-plan-22222222-2222-4222-8222-222222222222").props,
    ).toMatchObject({ accessibilityState: { selected: true } });
    await fireEvent.press(screen.getByTestId("personal-planned-session-submit"));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(activityPlanQueryInputs).toEqual(
      expect.arrayContaining([
        { ownerScope: "own", limit: 25 },
        { ownerScope: "system", limit: 25 },
      ]),
    );
    expect((createMock as jest.Mock).mock.calls[0]?.[0]).toMatchObject({
      session: {
        planningDate: "2026-08-16",
        activityPlanId: "22222222-2222-4222-8222-222222222222",
      },
    });
    expect((createMock as jest.Mock).mock.calls[0]?.[0].session).not.toHaveProperty("prescription");
  });
  it("locks the selected activity plan after an unconfirmed scheduling request", async () => {
    createMock.mockRejectedValueOnce(new Error("Request timed out"));
    await renderNative(<PersonalPlannedSessionCreate planningDate="2026-08-16" />);
    await fireEvent.press(screen.getByText("Tempo run"));
    await fireEvent.press(screen.getByTestId("personal-planned-session-submit"));
    await waitFor(() =>
      expect(screen.getByRole("alert").props.children).toContain("could not confirm scheduling"),
    );
    expect(
      screen.getByTestId("catalog-activity-plan-22222222-2222-4222-8222-222222222222").props,
    ).toMatchObject({ accessibilityState: { disabled: true, selected: true } });
  });
  it("shows a typed safe error and unlocks the intent after a definitive client error", async () => {
    createMock.mockRejectedValueOnce({
      data: { code: "BAD_REQUEST", httpStatus: 400 },
      message: "Failed query: select private_data",
    });
    await renderNative(<PersonalPlannedSessionCreate planningDate="2026-08-16" />);
    await fireEvent.press(screen.getByText("Tempo run"));
    await fireEvent.press(screen.getByTestId("personal-planned-session-submit"));
    await waitFor(() =>
      expect(screen.getByRole("alert").props.children).toBe(
        "The schedule details are invalid. Review them and try again.",
      ),
    );
    expect(
      screen.getByTestId("catalog-activity-plan-22222222-2222-4222-8222-222222222222").props,
    ).toMatchObject({ accessibilityState: { disabled: false, selected: true } });
  });
  it("shows the typed integrity error without exposing the server failure text", async () => {
    createMock.mockRejectedValueOnce({
      data: {
        code: "INTERNAL_SERVER_ERROR",
        applicationErrorCode: "ACTIVITY_PLAN_INTEGRITY_FAILED",
        httpStatus: 500,
      },
      message: "Activity plan structure integrity check failed",
    });
    await renderNative(<PersonalPlannedSessionCreate planningDate="2026-08-16" />);
    await fireEvent.press(screen.getByText("Tempo run"));
    await fireEvent.press(screen.getByTestId("personal-planned-session-submit"));
    await waitFor(() =>
      expect(screen.getByRole("alert").props.children).toBe(
        "That activity plan needs repair. Choose another plan and try again.",
      ),
    );
  });
  it("refreshes calendar pages after a scheduling conflict without reading a per-day session range", async () => {
    await renderNative(<PersonalPlannedSessionCreate planningDate="2026-08-16" />);
    await plannedSessionMutationOptions?.onConflict();
    expect(invalidateCalendarPageMock).toHaveBeenCalledTimes(1);
  });
});
