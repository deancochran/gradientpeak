// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ memberOptions: undefined as { enabled?: boolean } | undefined }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => vi.fn(),
    useParams: () => ({ groupId: "group-1" }),
  }),
}));
vi.mock("../../../../components/groups/group-ui", () => ({
  GroupManagementShell: ({ children }: React.PropsWithChildren) => children,
  MutationError: () => null,
  QueryState: ({ children }: React.PropsWithChildren) => children,
  canRenderRemoveMemberControl: () => false,
}));
vi.mock("../../../../lib/api/client", () => ({
  api: {
    groups: {
      detail: {
        useQuery: () => ({
          data: { viewer: { canViewMembers: false } },
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
      members: {
        useInfiniteQuery: (_input: unknown, options: { enabled?: boolean }) => {
          mocks.memberOptions = options;
          return { data: undefined, isLoading: false, refetch: vi.fn() };
        },
      },
      removeMember: { useMutation: () => ({}) },
      transferOwnership: { useMutation: () => ({}) },
      updateMemberRole: { useMutation: () => ({}) },
    },
    useUtils: () => ({ groups: { invalidate: vi.fn() } }),
  },
}));

import { Route } from "./members";

describe("Group members access gate", () => {
  it("disables the members query and management controls for an incapable viewer", () => {
    const Page = (Route as unknown as { component: React.ComponentType }).component;
    render(<Page />);

    expect(mocks.memberOptions).toMatchObject({ enabled: false });
    expect(screen.getByRole("alert").textContent).toContain("do not have permission");
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });
});
