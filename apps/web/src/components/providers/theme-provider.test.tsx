// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider, useTheme } from "./theme-provider";

vi.mock("../../lib/contract-epoch", () => ({
  ensureCurrentBrowserContractEpoch: vi.fn().mockResolvedValue(false),
}));

function ThemeValue() {
  const { resolvedTheme, theme } = useTheme();
  return <output>{`${theme}:${resolvedTheme}`}</output>;
}

describe("ThemeProvider persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "";
    window.matchMedia = vi.fn().mockReturnValue({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("restores the stored preference after mounting", async () => {
    localStorage.setItem("gradientpeak-theme-store", "dark");

    render(
      <ThemeProvider>
        <ThemeValue />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("dark:dark"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("gradientpeak-theme-store")).toBe("dark");
  });

  it("keeps the system default when storage cannot be read or written", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage blocked", "SecurityError");
    });

    render(
      <ThemeProvider>
        <ThemeValue />
      </ThemeProvider>,
    );

    await act(async () => {});
    expect(screen.getByRole("status").textContent).toBe("system:light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
