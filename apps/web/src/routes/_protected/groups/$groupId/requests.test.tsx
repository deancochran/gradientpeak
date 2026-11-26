// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ options: [] as Array<{ enabled?: boolean }> }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useParams: () => ({ groupId: "group-1" }),
  }),
}));
vi.mock("../../../../components/groups/group-ui", () => ({
  GroupManagementShell: ({ children }: React.PropsWithChildren) => children,
  MutationError: () => null,
  QueryState: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock("../../../../lib/api/client", () => ({
  api: {
    groups: {
      detail: {
        useQuery: () => ({
          data: { viewer: { canInvite: false, canManageJoinRequests: false } },
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
      inviteProfiles: { useMutation: () => ({}) },
      pendingInvitations: {
        useQuery: (_input: unknown, options: { enabled?: boolean }) => {
          mocks.options.push(options);
          return { isLoading: false, refetch: vi.fn() };
        },
      },
      pendingJoinRequests: {
        useQuery: (_input: unknown, options: { enabled?: boolean }) => {
          mocks.options.push(options);
          return { isLoading: false, refetch: vi.fn() };
        },
      },
      reviewJoinRequest: { useMutation: () => ({}) },
      revokeInvite: { useMutation: () => ({}) },
    },
    social: {
      searchUsers: {
        useQuery: (_input: unknown, options: { enabled?: boolean }) => {
          mocks.options.push(options);
          return { isLoading: false, refetch: vi.fn() };
        },
      },
    },
    useUtils: () => ({ groups: { invalidate: vi.fn() } }),
  },
}));

import { Route } from "./requests";

describe("Group requests access gate", () => {
  it("disables invitation and request queries for an incapable viewer", () => {
    const Page = (Route as unknown as { component: React.ComponentType }).component;
    render(<Page />);

    expect(mocks.options).toEqual([{ enabled: false }, { enabled: false }, { enabled: false }]);
    expect(screen.getByRole("alert").textContent).toContain("do not have permission");
    expect(screen.queryByRole("button", { name: /send.*invitation/i })).toBeNull();
  });
});
