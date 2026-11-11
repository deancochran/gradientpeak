import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const navigateMock = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ navigate: navigateMock }),
}));
jest.mock("react-native", () => ({
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: createHost("Pressable"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/badge", () => ({ Badge: createHost("Badge") }));
jest.mock("@repo/ui/components/icon", () => ({ Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("lucide-react-native", () => ({
  Bell: createHost("Bell"),
  Bot: createHost("Bot"),
  ChevronRight: createHost("ChevronRight"),
  MessageSquare: createHost("MessageSquare"),
}));
jest.mock("@/lib/api", () => ({
  api: {
    messaging: { getUnreadCount: { useQuery: () => ({ data: 2 }) } },
    notifications: { getUnreadCount: { useQuery: () => ({ data: 3 }) } },
  },
}));

const InboxScreen = require("../inbox").default;

describe("InboxScreen", () => {
  beforeEach(() => navigateMock.mockReset());

  it("links existing messages and notifications with their unread counts", async () => {
    await renderNative(<InboxScreen />);

    expect(screen.getByText("Messages")).toBeTruthy();
    expect(screen.getByText("Notifications")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("inbox-messages"));
    expect(navigateMock).toHaveBeenCalledWith("/messages");
    await fireEvent.press(screen.getByTestId("inbox-notifications"));
    expect(navigateMock).toHaveBeenCalledWith("/notifications");
    await fireEvent.press(screen.getByTestId("inbox-assistant"));
    expect(navigateMock).toHaveBeenCalledWith("./chat");
  });
});
