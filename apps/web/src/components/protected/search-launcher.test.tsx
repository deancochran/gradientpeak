// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());

class TestResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

vi.stubGlobal("ResizeObserver", TestResizeObserver);
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: () => undefined,
});

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: React.ComponentProps<"a"> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
}));
vi.mock("../providers/auth-provider", () => ({
  useAuth: () => ({ user: { id: "athlete-1" } }),
}));

import { SearchLauncher } from "./search-launcher";

describe("SearchLauncher", () => {
  beforeEach(() => {
    navigate.mockReset();
    navigate.mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  it("uses cmdk keyboard selection for navigation instead of submitting a content search", async () => {
    const user = userEvent.setup();
    render(<SearchLauncher />);

    await user.click(screen.getByTitle("Open search"));
    const input = screen.getByRole("combobox", { name: "Search GradientPeak" });
    await user.click(input);
    await user.keyboard("{ArrowDown}");

    expect(
      screen.getByText("Activities").closest("[cmdk-item]")?.getAttribute("data-selected"),
    ).toBe("true");

    await user.keyboard("{Enter}");

    expect(navigate).toHaveBeenCalledWith({ to: "/activities" });
  });

  it("keeps content search as a distinct selectable command", async () => {
    const user = userEvent.setup();
    render(<SearchLauncher />);

    await user.click(screen.getByTitle("Open search"));
    await user.type(screen.getByPlaceholderText("Search the web app..."), "tempo");
    await user.click(screen.getByText('Search for "tempo"'));

    expect(navigate).toHaveBeenCalledWith({ to: "/search", search: { q: "tempo" } });
  });
});
