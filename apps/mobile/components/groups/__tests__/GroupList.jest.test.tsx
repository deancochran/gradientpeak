import React from "react";
import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { GroupList } from "../GroupList";

jest.mock("@/components/shared/ResourceList", () => ({
  __esModule: true,
  ResourceList: ({
    data,
    renderItem,
  }: {
    data: unknown[];
    renderItem: (item: unknown) => React.ReactNode;
  }) =>
    React.createElement(
      "View",
      null,
      data.map((item, index) =>
        React.createElement(React.Fragment, { key: index }, renderItem(item)),
      ),
    ),
}));

jest.mock("../GroupCards", () => ({
  __esModule: true,
  GroupCard: (props: Record<string, unknown>) =>
    React.createElement("GroupCard", { ...props, testID: "group-list-card" }),
}));

jest.mock("../GroupStates", () => ({
  __esModule: true,
  GroupEmptyState: createHost("GroupEmptyState"),
  GroupListSkeleton: createHost("GroupListSkeleton"),
}));

describe("GroupList", () => {
  it("passes compact density directly to the canonical GroupCard", () => {
    renderNative(
      <GroupList
        groups={[
          {
            access_level: "public",
            avatar_url: null,
            cover_url: null,
            created_at: "2026-07-19T12:00:00.000Z",
            description: null,
            id: "group-1",
            join_policy: "open",
            name: "Sunday Riders",
            slug: "sunday-riders",
            updated_at: "2026-07-19T12:00:00.000Z",
            viewerMembershipRole: "member",
          },
        ]}
        variant="compact"
      />,
    );

    expect(screen.getByTestId("group-list-card").props.variant).toBe("compact");
  });
});
