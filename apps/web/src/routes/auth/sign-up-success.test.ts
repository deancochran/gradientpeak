import { describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((options: object) => options),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options }),
  redirect,
}));

import { Route } from "./sign-up-success";

describe("sign-up success compatibility route", () => {
  it("forwards legacy email and source search values to canonical verification", () => {
    const beforeLoad = Route.options.beforeLoad as unknown as (input: {
      search: { email?: string; source?: string };
    }) => void;

    expect(() =>
      beforeLoad({ search: { email: "athlete@example.test", source: "campaign" } }),
    ).toThrow(
      expect.objectContaining({
        to: "/auth/verify",
        search: {
          email: "athlete@example.test",
          flash: undefined,
          flashType: undefined,
          source: "campaign",
        },
      }),
    );
  });

  it("marks original sign-up success URLs with the sign-up source", () => {
    const beforeLoad = Route.options.beforeLoad as unknown as (input: {
      search: { email?: string };
    }) => void;

    expect(() => beforeLoad({ search: { email: "athlete@example.test" } })).toThrow(
      expect.objectContaining({
        search: expect.objectContaining({ source: "sign-up" }),
      }),
    );
  });
});
