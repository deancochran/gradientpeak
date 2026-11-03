// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  links: [] as Array<{ params?: unknown; search?: unknown; to: string }>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    ...props
  }: {
    children: ReactNode;
    params?: unknown;
    search?: unknown;
    to: string;
  }) => {
    mocks.links.push(props);
    return <a href={props.to}>{children}</a>;
  },
  useRouter: () => ({ invalidate: mocks.invalidate }),
}));

import {
  OrganizationSelector,
  OrganizationSelectorError,
  OrganizationSelectorFrame,
  OrganizationSelectorPending,
} from "./organization-selector";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.links.length = 0;
});

describe("OrganizationSelector", () => {
  it("renders safe organization metadata and explicit dashboard links without athlete content", () => {
    render(
      <OrganizationSelectorFrame heading="Coaching organizations">
        <OrganizationSelector
          page={{
            items: [
              {
                organization: { organizationId: "organization-1", name: "Summit Coaching" },
                membership: { roles: ["admin", "coach", "constructor", "toString", "unexpected"] },
                isRootOwner: true,
              },
            ],
            nextCursor: "next-page",
            hasMore: true,
          }}
        />
      </OrganizationSelectorFrame>,
    );

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("main").parentElement?.classList.contains("gp-protected-shell")).toBe(
      true,
    );
    expect(screen.getByRole("link", { name: "Personal workspace" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Coaching organizations" })).toBeTruthy();
    expect(screen.getByText("Admin")).toBeTruthy();
    expect(screen.getByText("Coach")).toBeTruthy();
    expect(screen.queryByText("unexpected")).toBeNull();
    expect(screen.queryByText("constructor")).toBeNull();
    expect(screen.queryByText("toString")).toBeNull();
    expect(screen.getByText("Root owner")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open Summit Coaching coaching dashboard" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Next page" })).toBeTruthy();
    expect(screen.queryByText(/athlete/i)).toBeNull();
    expect(mocks.links).toContainEqual(
      expect.objectContaining({
        to: "/organizations/$organizationId/dashboard",
        params: { organizationId: "organization-1" },
      }),
    );
    expect(mocks.links).toContainEqual(
      expect.objectContaining({ to: "/organizations", search: { cursor: "next-page" } }),
    );
  });

  it("distinguishes authorized empty and stale cursor pages", () => {
    const { rerender } = render(
      <OrganizationSelector page={{ items: [], nextCursor: null, hasMore: false }} />,
    );
    expect(screen.getByRole("heading", { name: "No coaching organizations" })).toBeTruthy();

    rerender(
      <OrganizationSelector
        cursor="stale-page"
        page={{ items: [], nextCursor: null, hasMore: false }}
      />,
    );
    expect(screen.getByRole("heading", { name: "No organizations on this page" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to first page" })).toBeTruthy();
  });

  it("renders pending and error recovery states separately", () => {
    const { rerender } = render(<OrganizationSelectorPending />);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Loading organizations" })).toBeTruthy();
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
    expect(screen.getByRole("link", { name: "Personal workspace" })).toBeTruthy();

    rerender(<OrganizationSelectorError />);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Organizations unavailable" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("could not load");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.invalidate).toHaveBeenCalledOnce();
  });

  it("offers first-page and forward-only pagination links", () => {
    render(
      <OrganizationSelector
        cursor="current-page"
        page={{
          items: [
            {
              organization: { organizationId: "organization-1", name: "Summit Coaching" },
              membership: { roles: ["coach"] },
              isRootOwner: false,
            },
          ],
          nextCursor: "next-page",
          hasMore: true,
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "First page" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Next page" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /previous/i })).toBeNull();
    expect(mocks.links).toContainEqual(
      expect.objectContaining({ to: "/organizations", search: { cursor: undefined } }),
    );
    expect(mocks.links).toContainEqual(
      expect.objectContaining({ to: "/organizations", search: { cursor: "next-page" } }),
    );
  });
});
