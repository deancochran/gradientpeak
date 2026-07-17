import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((options: unknown) => ({ redirect: options })),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => options,
  redirect: mocks.redirect,
}));

import { Route } from "./coaching";

describe("legacy coaching route", () => {
  it("does not render the legacy profile-scoped coaching dashboard", () => {
    const beforeLoad = (Route as unknown as { beforeLoad: () => void }).beforeLoad;

    expect(() => beforeLoad()).toThrow();
    expect(mocks.redirect).toHaveBeenCalledWith({ to: "/" });
  });
});
