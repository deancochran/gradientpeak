import { createHost as mockCreateHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { formatGroupEventDateRange, GroupEventCard } from "../GroupEventCards";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: mockCreateHost("Pressable"),
  TouchableOpacity: mockCreateHost("TouchableOpacity"),
  View: mockCreateHost("View"),
}));

jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: mockCreateHost("Avatar"),
  AvatarFallback: mockCreateHost("AvatarFallback"),
  AvatarImage: mockCreateHost("AvatarImage"),
}));
jest.mock("@repo/ui/components/button", () => ({ Button: mockCreateHost("Button") }));
jest.mock("@repo/ui/components/text", () => ({ Text: mockCreateHost("Text") }));
jest.mock("lucide-react-native", () => ({
  CalendarDays: mockCreateHost("CalendarDays"),
  MapPin: mockCreateHost("MapPin"),
}));
jest.mock("@/lib/server-config", () => ({
  getReachableSupabaseStorageUrl: (value: string) => value,
}));

const event = {
  id: "event-1",
  group_id: "group-1",
  title: "Long ride",
  description: "Steady endurance pace.",
  starts_at: "2026-08-01T09:00:00.000Z",
  ends_at: "2026-08-01T11:00:00.000Z",
  timezone: "UTC",
  location_name: "Clubhouse",
  cancelled_at: null,
  activity_plan_id: null,
  acceptedRsvpCount: 4,
  viewerRsvp: null,
  group: {
    id: "group-1",
    name: "Sunday Riders",
    slug: "sunday-riders",
    avatar_url: null,
  },
} as Parameters<typeof GroupEventCard>[0]["event"];

describe("GroupEventCard", () => {
  it("formats event wall time in the organizer zone", () => {
    const label = formatGroupEventDateRange({
      starts_at: "2026-06-01T10:30:00.000Z",
      ends_at: "2026-06-01T11:30:00.000Z",
      timezone: "Pacific/Kiritimati",
    });

    expect(label).toContain("12:30 AM");
    expect(label).toContain("1:30 AM");
  });

  it("exposes a default identity and accessible navigation action", async () => {
    const onPress = jest.fn();
    await renderNative(<GroupEventCard event={event} onPress={onPress} />);

    const card = screen.getByTestId("group-event-card-event-1");
    expect(card.props.accessibilityRole).toBe("button");
    expect(card.props.accessibilityLabel).toBe("Open group event Long ride");

    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalledWith(event);
  });
});
