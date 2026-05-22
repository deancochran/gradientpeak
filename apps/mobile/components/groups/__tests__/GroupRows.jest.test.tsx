import React from "react";
import { createHost as mockCreateHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { GroupJoinRequestRow, GroupMemberRow } from "../GroupRows";

const navigateToMock = jest.fn();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: mockCreateHost("Pressable"),
  View: mockCreateHost("View"),
}));

jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: mockCreateHost("Avatar"),
  AvatarFallback: mockCreateHost("AvatarFallback"),
  AvatarImage: mockCreateHost("AvatarImage"),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: mockCreateHost("Button"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => navigateToMock,
}));

jest.mock("../GroupBadges", () => ({
  __esModule: true,
  GroupMembershipRoleBadge: mockCreateHost("GroupMembershipRoleBadge"),
}));

describe("GroupRows", () => {
  beforeEach(() => {
    navigateToMock.mockReset();
  });

  it("opens a member profile from the member row", () => {
    renderNative(
      <GroupMemberRow
        member={
          {
            created_at: "2026-05-01T00:00:00.000Z",
            profile: { id: "user-1", username: "Runner", avatar_url: null },
            role: "member",
          } as any
        }
      />,
    );

    fireEvent.press(screen.getByTestId("group-member-profile-link-user-1"));

    expect(navigateToMock).toHaveBeenCalledWith("/user/user-1");
  });

  it("opens a join requester profile from the requester identity row", () => {
    renderNative(
      <GroupJoinRequestRow
        joinRequest={
          {
            created_at: "2026-05-01T00:00:00.000Z",
            id: "request-1",
            profile: { id: "user-2", username: "Climber", avatar_url: null },
          } as any
        }
      />,
    );

    fireEvent.press(screen.getByTestId("group-join-request-profile-link-user-2"));

    expect(navigateToMock).toHaveBeenCalledWith("/user/user-2");
  });
});
