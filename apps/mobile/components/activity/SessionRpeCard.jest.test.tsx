import { act } from "@testing-library/react-native";
import { createHost as mockCreateHost } from "../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../test/render-native";
import { SessionRpeCard } from "./SessionRpeCard";

const mutate = jest.fn();
const mockInvalidatePostActivityIngestionQueries = jest.fn(
  async (..._args: unknown[]) => undefined,
);
let mutationOptions: {
  onError?: (error: Error) => void;
  onSuccess?: (evidence: { id: string }, variables: { rpe: number }) => Promise<void>;
} = {};

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

  it("keeps RPE unset on mount and submits a selected value once", async () => {
    await renderNative(<SessionRpeCard activityId="activity-1" effectiveSessionRpe={null} />);

    expect(screen.getByText("No RPE recorded")).toBeTruthy();
    expect(
      screen.getByText("No value found. Select a value from 1 to 10 to record session effort."),
    ).toBeTruthy();
    await fireEvent(screen.getByLabelText("Session RPE"), "valueChange", 7);
    expect(screen.getByText("Very hard — difficult to sustain.")).toBeTruthy();
    expect(mutate).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("activity-session-rpe-save"));
    await fireEvent.press(screen.getByTestId("activity-session-rpe-save"));

    expect(mutate).toHaveBeenCalledWith({
      activity_id: "activity-1",
      operation_id: "operation-id",
      rpe: 7,
      source: "user",
    });
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("keeps a rejected RPE draft for retry", async () => {
    await renderNative(<SessionRpeCard activityId="activity-1" effectiveSessionRpe={null} />);
    await fireEvent(screen.getByLabelText("Session RPE"), "valueChange", 7);
    await fireEvent.press(screen.getByTestId("activity-session-rpe-save"));
    await act(async () => mutationOptions.onError?.(new Error("Network unavailable")));
    expect(screen.getByText("Network unavailable")).toBeTruthy();
    expect(screen.getByLabelText("Session RPE").props.value).toBe(7);
  });

  it("invalidates both Plan read models after RPE success", async () => {
    await renderNative(<SessionRpeCard activityId="activity-1" effectiveSessionRpe={null} />);
    await act(async () => mutationOptions.onSuccess?.({ id: "evidence-1" }, { rpe: 7 }));
    expect(mockInvalidatePostActivityIngestionQueries).toHaveBeenCalledTimes(1);
  });
});
