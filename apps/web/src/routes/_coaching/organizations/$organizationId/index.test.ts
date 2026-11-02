import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((options: unknown) => ({ redirect: options })),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => options,
  redirect: mocks.redirect,
}));

import { Route } from "./index";

describe("organization coaching index", () => {
  it("redirects to the organization dashboard", () => {
    const beforeLoad = (
      Route as unknown as {
        beforeLoad: (input: { params: { organizationId: string } }) => void;
      }
    ).beforeLoad;

    expect(() =>
      beforeLoad({ params: { organizationId: "11111111-1111-4111-8111-111111111111" } }),
    ).toThrow();
    expect(mocks.redirect).toHaveBeenCalledWith({
      to: "/organizations/$organizationId/dashboard",
      params: { organizationId: "11111111-1111-4111-8111-111111111111" },
    });
  });
});
