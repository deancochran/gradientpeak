import { act } from "@testing-library/react-native";
import { createHost as mockCreateHost } from "../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../test/render-native";
import { SessionRpeCard } from "./SessionRpeCard";

const mutate = jest.fn();
const mockInvalidatePostActivityIngestionQueries = jest.fn(
  async (..._args: unknown[]) => undefined,
);
let mutationOptions: { onSuccess?: (evidence: { id: string }) => Promise<void> } = {};

jest.mock("expo-crypto", () => ({ randomUUID: () => "operation-id" }));
jest.mock("@repo/api/client", () => ({
  invalidatePostActivityIngestionQueries: (...args: unknown[]) =>
    mockInvalidatePostActivityIngestionQueries(...args),
}));
jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}) }));
jest.mock("@repo/ui/components/card", () => ({
  Card: mockCreateHost("Card"),
  CardContent: mockCreateHost("CardContent"),
  CardHeader: mockCreateHost("CardHeader"),
  CardTitle: mockCreateHost("CardTitle"),
}));
jest.mock("@repo/ui/components/slider", () => ({ Slider: mockCreateHost("Slider") }));
jest.mock("@repo/ui/components/text", () => ({ Text: mockCreateHost("Text") }));
jest.mock("@/lib/api", () => ({
  api: {
    useUtils: () => ({
      activities: {
        getById: { invalidate: jest.fn(async () => undefined) },
        dailyCommonLoadObservations: { invalidate: jest.fn(async () => undefined) },
      },
      trainingPlans: {
        preview: { invalidate: jest.fn(async () => undefined) },
      },
    }),
    activities: {
      recordSessionRpe: {
        useMutation: (options: typeof mutationOptions) => {
          mutationOptions = options;
          return { isPending: false, mutate };
        },
      },
    },
  },
}));

describe("SessionRpeCard", () => {
  beforeEach(() => jest.clearAllMocks());

  it("debounces slider changes before saving without a client-recorded timestamp", async () => {
    jest.useFakeTimers();
    await renderNative(<SessionRpeCard activityId="activity-1" effectiveSessionRpe={null} />);

    expect(screen.getByText("0/10 · No value found")).toBeTruthy();
    expect(
      screen.getByText("No value found. Select a value from 1 to 10 to record session effort."),
    ).toBeTruthy();
    await fireEvent(screen.getByLabelText("Session RPE"), "valueChange", 7);
    expect(screen.getByText("7/10")).toBeTruthy();
    expect(screen.getByText("Very hard — difficult to sustain.")).toBeTruthy();
    expect(mutate).not.toHaveBeenCalled();
    jest.advanceTimersByTime(500);

    expect(mutate).toHaveBeenCalledWith({
      activity_id: "activity-1",
      operation_id: "operation-id",
      rpe: 7,
      source: "user",
    });
    jest.useRealTimers();
  });

  it("invalidates both Plan read models after RPE success", async () => {
    await renderNative(<SessionRpeCard activityId="activity-1" effectiveSessionRpe={null} />);
    await act(async () => mutationOptions.onSuccess?.({ id: "evidence-1" }));
    expect(mockInvalidatePostActivityIngestionQueries).toHaveBeenCalledTimes(1);
  });
});
