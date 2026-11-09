// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  links: [] as Array<{ className?: string; params?: unknown; search?: unknown; to: string }>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    ...props
  }: {
    children: ReactNode;
    className?: string;
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
  vi.unstubAllGlobals();
  mocks.links.length = 0;
});

describe("OrganizationSelector", () => {
  const pageWithOrganizations = {
    items: [
      {
        organization: { organizationId: "organization-admin", name: "Summit Coaching" },
        membership: { roles: ["admin"] },
        isRootOwner: false,
      },
      {
        organization: { organizationId: "organization-coach", name: "Peak Development" },
        membership: { roles: ["coach"] },
        isRootOwner: false,
      },
    ],
    nextCursor: "next-page",
    hasMore: true,
  };

  it("keeps the administration overview as the default for an organization administrator", () => {
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
    expect(mocks.links).toContainEqual(
      expect.objectContaining({
        className: expect.stringContaining("whitespace-normal"),
        to: "/organizations/$organizationId/dashboard",
      }),
    );
  });

  it("sends a coach-only membership directly to assignment facts", () => {
    render(
      <OrganizationSelector
        page={{
          items: [
            {
              organization: { organizationId: "organization-1", name: "Summit Coaching" },
              membership: { roles: ["coach"] },
              isRootOwner: false,
            },
          ],
          nextCursor: null,
          hasMore: false,
        }}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Open Summit Coaching coaching workspace" }),
    ).toBeTruthy();
    expect(mocks.links).toContainEqual(
      expect.objectContaining({
        to: "/organizations/$organizationId/coaching",
        params: { organizationId: "organization-1" },
      }),
    );
  });

  it("filters the loaded page by a trimmed, case-insensitive organization name", () => {
    render(<OrganizationSelector page={pageWithOrganizations} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Filter organizations on this page" }), {
      target: { value: "  PEAK  " },
    });

    expect(screen.getByText("Peak Development")).toBeTruthy();
    expect(screen.queryByText("Summit Coaching")).toBeNull();
    expect(screen.getByText("Filters organizations shown on this page only.")).toBeTruthy();
  });

  it("preserves a valid unbroken organization name while allowing its heading and action to wrap", () => {
    const organizationName = "x".repeat(120);
    render(
      <OrganizationSelector
        page={{
          items: [
            {
              organization: { organizationId: "organization-unbroken", name: organizationName },
              membership: { roles: ["admin"] },
              isRootOwner: false,
            },
          ],
          nextCursor: null,
          hasMore: false,
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: organizationName }).className).toContain(
      "[overflow-wrap:anywhere]",
    );
    expect(
      screen.getByRole("link", { name: `Open ${organizationName} coaching dashboard` }),
    ).toBeTruthy();
    expect(mocks.links).toContainEqual(
      expect.objectContaining({
        className: expect.stringContaining("[overflow-wrap:anywhere]"),
        to: "/organizations/$organizationId/dashboard",
      }),
    );
  });

  it("shows a page-local no-match state without replacing pagination", () => {
    render(<OrganizationSelector cursor="current-page" page={pageWithOrganizations} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Filter organizations on this page" }), {
      target: { value: "missing" },
    });

    expect(screen.getByText("No organizations on this page match this filter.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Coaching organizations" })).toBeNull();
    expect(screen.getByRole("link", { name: "First page" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Next page" })).toBeTruthy();
  });

  it("clears the page-local filter without making an API request", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<OrganizationSelector page={pageWithOrganizations} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Filter organizations on this page" }), {
      target: { value: "peak" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Clear Filter organizations on this page" }),
    );

    expect(screen.getByText("Summit Coaching")).toBeTruthy();
    expect(screen.getByText("Peak Development")).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resets the filter for a new cursor page while retaining cursor navigation", () => {
    const { rerender } = render(
      <OrganizationSelector cursor="current-page" page={pageWithOrganizations} />,
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter organizations on this page" }), {
      target: { value: "peak" },
    });
    expect(screen.queryByText("Summit Coaching")).toBeNull();
    expect(mocks.links).toContainEqual(
      expect.objectContaining({ to: "/organizations", search: { cursor: "next-page" } }),
    );

    rerender(
      <OrganizationSelector
        cursor="next-page"
        page={{
          items: [
            {
              organization: { organizationId: "organization-lakeside", name: "Lakeside Coaching" },
              membership: { roles: ["coach"] },
              isRootOwner: false,
            },
            {
              organization: { organizationId: "organization-ridge", name: "Ridge Training" },
              membership: { roles: ["admin"] },
              isRootOwner: false,
            },
          ],
          nextCursor: "third-page",
          hasMore: true,
        }}
      />,
    );

    expect(
      (
        screen.getByRole("searchbox", {
          name: "Filter organizations on this page",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
    expect(screen.getByText("Lakeside Coaching")).toBeTruthy();
    expect(screen.getByText("Ridge Training")).toBeTruthy();
    expect(mocks.links).toContainEqual(
      expect.objectContaining({ to: "/organizations", search: { cursor: "third-page" } }),
    );
  });

  it("retains the filter when the same cursor page rerenders", () => {
    const { rerender } = render(
      <OrganizationSelector cursor="current-page" page={pageWithOrganizations} />,
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter organizations on this page" }), {
      target: { value: "peak" },
    });

    rerender(<OrganizationSelector cursor="current-page" page={{ ...pageWithOrganizations }} />);

    expect(
      (
        screen.getByRole("searchbox", {
          name: "Filter organizations on this page",
        }) as HTMLInputElement
      ).value,
    ).toBe("peak");
    expect(screen.queryByText("Summit Coaching")).toBeNull();
    expect(screen.getByText("Peak Development")).toBeTruthy();
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
