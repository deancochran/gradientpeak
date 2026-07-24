import { createHost as mockCreateHost } from "../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../test/render-native";
import { SessionRpeCard } from "./SessionRpeCard";

const mutate = jest.fn();

jest.mock("expo-crypto", () => ({ randomUUID: () => "operation-id" }));
jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: mockCreateHost("Pressable"),
  View: mockCreateHost("View"),
}));
jest.mock("@repo/ui/components/card", () => ({
  Card: mockCreateHost("Card"),
  CardContent: mockCreateHost("CardContent"),
  CardHeader: mockCreateHost("CardHeader"),
  CardTitle: mockCreateHost("CardTitle"),
}));
jest.mock("@repo/ui/components/text", () => ({ Text: mockCreateHost("Text") }));
jest.mock("@/lib/api", () => ({
  api: {
    useUtils: () => ({}),
    activities: { recordSessionRpe: { useMutation: () => ({ isPending: false, mutate }) } },
  },
}));

describe("SessionRpeCard", () => {
  beforeEach(() => jest.clearAllMocks());

  it("does not send a client-recorded timestamp with the RPE mutation", () => {
    renderNative(<SessionRpeCard activityId="activity-1" effectiveSessionRpe={null} />);

    fireEvent.press(screen.getByLabelText("Session RPE 7"));
    fireEvent.press(screen.getByTestId("activity-session-rpe-submit"));

    expect(mutate).toHaveBeenCalledWith({
      activity_id: "activity-1",
      operation_id: "operation-id",
      rpe: 7,
      source: "user",
    });
  });
});
