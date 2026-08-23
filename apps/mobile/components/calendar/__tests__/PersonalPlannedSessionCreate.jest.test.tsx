import { fireEvent, renderNative, screen, waitFor } from "../../../test/render-native";

const createMock = jest.fn(async () => undefined);
const invalidateCalendarPageMock = jest.fn(async () => undefined);
const replaceMock = jest.fn();
let plannedSessionMutationOptions: { onConflict: () => Promise<unknown> } | null = null;

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
  useAuthStore: (selector: (state: { profile: { id: string } }) => unknown) =>
    selector({ profile: { id: "11111111-1111-4111-8111-111111111111" } }),
}));
jest.mock("@/lib/api", () => ({
  api: {
    useUtils: () => ({ calendar: { page: { invalidate: invalidateCalendarPageMock } } }),
    activityPlans: {
      list: {
        useQuery: () => ({
          data: {
            items: [
              {
                id: "22222222-2222-4222-8222-222222222222",
                name: "Tempo run",
                activityCategory: "run",
                activityPlanRevision: 6,
                prescriptionQuantification: null,
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
                              id: "55555555-5555-4555-8555-555555555555",
                              name: "Work",
                              duration: { type: "time", seconds: 1_200 },
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
          },
          isError: false,
          isLoading: false,
          refetch: jest.fn(),
        }),
      },
    },
  },
}));

const { PersonalPlannedSessionCreate } = require("../PersonalPlannedSessionCreate");

describe("PersonalPlannedSessionCreate", () => {
  beforeEach(() => {
    createMock.mockClear();
    invalidateCalendarPageMock.mockClear();
    plannedSessionMutationOptions = null;
  });

  it("sends the selected plan identity so the server creates the snapshot", async () => {
    await renderNative(<PersonalPlannedSessionCreate planningDate="2026-08-16" />);

    await fireEvent.press(screen.getByText("Tempo run"));
    await fireEvent.press(screen.getByTestId("personal-planned-session-submit"));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect((createMock as jest.Mock).mock.calls[0]?.[0]).toMatchObject({
      session: {
        planningDate: "2026-08-16",
        activityPlanId: "22222222-2222-4222-8222-222222222222",
      },
    });
    expect((createMock as jest.Mock).mock.calls[0]?.[0].session).not.toHaveProperty("prescription");
  });

  it("refreshes calendar pages after a scheduling conflict without reading a per-day session range", async () => {
    await renderNative(<PersonalPlannedSessionCreate planningDate="2026-08-16" />);

    await plannedSessionMutationOptions?.onConflict();

    expect(invalidateCalendarPageMock).toHaveBeenCalledTimes(1);
  });
});
