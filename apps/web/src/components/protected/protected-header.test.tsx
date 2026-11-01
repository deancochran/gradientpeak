// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const location = vi.hoisted(() => ({ pathname: "/plan" }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: React.ComponentProps<"a"> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useLocation: () => location,
}));
vi.mock("../providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "athlete-1" } }),
}));
vi.mock("./messages-button", () => ({
  MessagesButton: () => <button type="button">Messages</button>,
}));
vi.mock("./notifications-button", () => ({
  NotificationsButton: () => <button type="button">Notifications</button>,
}));
vi.mock("./search-launcher", () => ({
  SearchLauncher: () => <button type="button">Search</button>,
}));
vi.mock("./user-nav", () => ({
  UserNav: () => <button type="button">User menu</button>,
}));

import { ProtectedHeader } from "./protected-header";

describe("ProtectedHeader", () => {
  afterEach(cleanup);

  it("opens the real Sheet menu, exposes mobile account links, and restores focus after close", async () => {
    const user = userEvent.setup();
    location.pathname = "/plan";
    render(<ProtectedHeader />);

    const trigger = screen.getByRole("button", { name: "Open navigation menu" });
    await user.click(trigger);

    const sheet = screen.getByRole("dialog", { name: "Navigation" });
    const description = screen.getByText("Navigate GradientPeak.");
    expect(sheet).not.toBeNull();
    expect(screen.getByRole("link", { name: "Plan" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Profile" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Settings" })).not.toBeNull();
    expect(sheet.getAttribute("aria-describedby")).toBe(description.id);

    await user.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Navigation" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("marks Profile active in both desktop and Sheet navigation", async () => {
    const user = userEvent.setup();
    location.pathname = "/user/athlete-1";
    render(<ProtectedHeader />);

    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));

    for (const profileLink of screen.getAllByRole("link", { name: "Profile" })) {
      expect(profileLink.getAttribute("aria-current")).toBe("page");
    }
  });

  it("marks Settings active in both desktop and Sheet navigation", async () => {
    const user = userEvent.setup();
    location.pathname = "/settings";
    render(<ProtectedHeader />);

    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));

    for (const settingsLink of screen.getAllByRole("link", { name: "Settings" })) {
      expect(settingsLink.getAttribute("aria-current")).toBe("page");
    }
  });
});
