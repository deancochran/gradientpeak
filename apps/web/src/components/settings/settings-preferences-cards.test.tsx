// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductAnalyticsCard } from "./settings-preferences-cards";

const mocks = vi.hoisted(() => ({
  posthog: {
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
  },
}));

vi.mock("@posthog/react", () => ({ usePostHog: () => mocks.posthog }));
vi.mock("@repo/ui/components/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("@repo/ui/components/label", () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));
vi.mock("@repo/ui/components/switch", () => ({
  Switch: ({
    checked,
    id,
    onCheckedChange,
  }: {
    checked: boolean;
    id: string;
    onCheckedChange: (checked: boolean) => void;
  }) => (
    <button
      aria-checked={checked}
      id={id}
      onClick={() => onCheckedChange(!checked)}
      role="switch"
      type="button"
    />
  ),
}));
vi.mock("@repo/ui/components/button", () => ({ Button: () => null }));
vi.mock("../providers/theme-provider", () => ({ useTheme: vi.fn() }));

describe("ProductAnalyticsCard persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.posthog.opt_in_capturing.mockReset();
    mocks.posthog.opt_out_capturing.mockReset();
  });

  afterEach(cleanup);

  it("restores only an explicit persisted opt-in", async () => {
    localStorage.setItem("gradientpeak-product-analytics-consent", "granted");

    render(<ProductAnalyticsCard />);

    await waitFor(() =>
      expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true"),
    );
    expect(mocks.posthog.opt_in_capturing).toHaveBeenCalledWith({ captureEventName: false });
  });

  it("keeps analytics opted out when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage blocked", "SecurityError");
    });

    render(<ProductAnalyticsCard />);

    await waitFor(() =>
      expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false"),
    );
    expect(mocks.posthog.opt_out_capturing).toHaveBeenCalledOnce();
  });

  it("does not enable analytics when persisting the opt-in fails", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage blocked", "SecurityError");
    });

    render(<ProductAnalyticsCard />);
    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() =>
      expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false"),
    );
    expect(mocks.posthog.opt_out_capturing).toHaveBeenCalled();
  });
});
