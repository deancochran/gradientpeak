// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RouteFlashToast } from "./route-flash-toast";

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(toastMocks.info, {
    success: toastMocks.success,
    error: toastMocks.error,
  }),
}));

describe("RouteFlashToast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears one route flash once when its callback identity changes", () => {
    const firstClear = vi.fn();
    const secondClear = vi.fn();
    const view = render(
      <RouteFlashToast message="Conversation ready" type="success" clear={firstClear} />,
    );

    view.rerender(
      <RouteFlashToast message="Conversation ready" type="success" clear={secondClear} />,
    );

    expect(toastMocks.success).toHaveBeenCalledTimes(1);
    expect(firstClear).toHaveBeenCalledTimes(1);
    expect(secondClear).not.toHaveBeenCalled();
  });
});
