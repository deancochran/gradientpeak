import { createHost as mockCreateHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { GroupCard } from "../GroupCards";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  TouchableOpacity: mockCreateHost("TouchableOpacity"),
  View: mockCreateHost("View"),
}));

jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: mockCreateHost("Avatar"),
  AvatarFallback: mockCreateHost("AvatarFallback"),
  AvatarImage: mockCreateHost("AvatarImage"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));
jest.mock("lucide-react-native", () => ({ __esModule: true, Users: mockCreateHost("Users") }));
jest.mock("@/lib/server-config", () => ({
  __esModule: true,
  getReachableSupabaseStorageUrl: (url: string) => url,
}));
jest.mock("../GroupBadges", () => ({
  __esModule: true,
  GroupAccessLevelBadge: mockCreateHost("GroupAccessLevelBadge"),
  GroupJoinPolicyBadge: mockCreateHost("GroupJoinPolicyBadge"),
  GroupRelationshipBadge: mockCreateHost("GroupRelationshipBadge"),
}));

const group = {
  access_level: "public",
  avatar_url: null,
  description: "Weekly rides and coffee",
  id: "group-1",
  join_policy: "open",
  name: "Sunday Riders",
  slug: "sunday-riders",
} as Parameters<typeof GroupCard>[0]["group"];

describe("GroupCard", () => {
  it("renders compact identity and metadata, and forwards its press contract", () => {
    const onPress = jest.fn();

    renderNative(
      <GroupCard group={group} onPress={onPress} testID="group-card" variant="compact" />,
    );

    expect(screen.getByText("Sunday Riders")).toBeTruthy();
    expect(screen.getByText("Weekly rides and coffee")).toBeTruthy();
    fireEvent.press(screen.getByTestId("group-card"));
    expect(onPress).toHaveBeenCalledWith(group);
  });

  it("uses policy metadata and exposes disabled and selected accessibility state", () => {
    renderNative(
      <GroupCard
        disabled
        group={{ ...group, description: "" }}
        selected
        testID="selected-group-card"
        variant="compact"
      />,
    );

    expect(screen.getByText("Open to join")).toBeTruthy();
    expect(screen.getByTestId("selected-group-card").props.accessibilityState).toEqual({
      disabled: true,
      selected: true,
    });
  });
});
