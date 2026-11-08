// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  resend: vi.fn(),
  email: "first@example.test",
  accountIdentity: "account-a",
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    options,
    useNavigate: () => vi.fn(),
    useSearch: () => ({ email: state.email }),
    useRouteContext: () => ({
      authenticatedEmail: state.email,
      accountIdentity: state.accountIdentity,
    }),
  }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/auth/login">{children}</a>,
  isRedirect: () => false,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("../../components/route-flash-toast", () => ({ RouteFlashToast: () => null }));
vi.mock("../../lib/auth/route-guards", () => ({
  publicAuthPageMiddleware: [],
  resolveRouteAuthSession: vi.fn(),
}));
vi.mock("../../lib/auth/server-actions", () => ({
  sendVerificationEmailAction: Object.assign((args: unknown) => state.resend(args), {
    url: "/verify",
  }),
}));
vi.mock("../../lib/contract-epoch", () => ({
  contractEpochFormInputProps: { type: "hidden", name: "epoch", value: "test" },
}));

import { Route } from "./verify";

const Page = Route.options.component as React.ComponentType;
const form = () => {
  const element = screen.getByRole("button", { name: "Resend Verification Email" }).closest("form");
  if (!element) throw new Error("Verification form is missing");
  return element;
};
afterEach(cleanup);
beforeEach(() => {
  state.resend.mockReset().mockResolvedValue({ ok: true });
  state.email = "first@example.test";
  state.accountIdentity = "account-a";
});
describe("verification recovery", () => {
  it("captures one request and announces a generic success, with the POST fallback intact", async () => {
    let resolve!: (value: { ok: true }) => void;
    state.resend.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<Page />);
    const element = form();
    expect(element.getAttribute("action")).toBe("/verify");
    expect(element.method).toBe("post");
    act(() => {
      fireEvent.submit(element);
      fireEvent.submit(element);
    });
    expect(state.resend).toHaveBeenCalledOnce();
    const data = state.resend.mock.calls[0]?.[0].data as FormData;
    expect(data.get("email")).toBe("first@example.test");
    expect(data.get("epoch")).toBe("test");
    await act(async () => {
      resolve({ ok: true });
    });
    expect(screen.getByRole("status").textContent).toBe(
      "If this address can receive verification, a message is on its way.",
    );
  });
  it("announces transport rejection without private detail and permits an explicit retry", async () => {
    state.resend.mockRejectedValueOnce(new Error("private detail"));
    render(<Page />);
    fireEvent.submit(form());
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Verification could not be requested. Please try again.",
    );
    fireEvent.submit(form());
    await screen.findByRole("status");
    expect(state.resend).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("ignores the prior verification context when its request settles", async () => {
    let reject!: (error: Error) => void;
    state.resend.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    const view = render(<Page />);
    fireEvent.submit(form());
    state.email = "second@example.test";
    state.accountIdentity = "account-b";
    view.rerender(<Page />);
    state.resend.mockReturnValueOnce(new Promise(() => {}));
    fireEvent.submit(form());
    await act(async () => {
      reject(new Error("stale"));
    });
    await waitFor(() => expect(state.resend).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Sending verification email..." }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
