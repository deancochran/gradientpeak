// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal(
  "ResizeObserver",
  class {
    disconnect() {}
    observe() {}
    unobserve() {}
  },
);

const state = vi.hoisted(() => ({
  user: { id: "account-a", email: "a@example.test", emailVerified: false },
  password: vi.fn(),
  revoke: vi.fn(),
  resend: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => vi.fn(),
    useSearch: () => ({}),
  }),
  isRedirect: () => false,
  useBlocker: () => undefined,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@posthog/react", () => ({ usePostHog: () => null }));
vi.mock("../../components/providers/auth-provider", () => ({
  useAuth: () => ({ user: state.user, isLoading: false }),
}));
vi.mock("../../components/providers/theme-provider", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));
vi.mock("../../components/route-flash-toast", () => ({ RouteFlashToast: () => null }));
vi.mock("../../lib/api/client", () => ({
  api: {
    useUtils: () => ({ profiles: { get: { invalidate: vi.fn() } } }),
    profiles: { get: { useQuery: () => ({ data: undefined, isLoading: false }) } },
    storage: { getSignedUrl: { useQuery: () => ({ data: undefined }) } },
  },
}));
vi.mock("../../lib/contract-epoch", () => ({
  contractEpochFormInputProps: { type: "hidden", name: "epoch", value: "test" },
}));
vi.mock("../../lib/profile/server-actions", () => ({
  removeProfileImageAction: Object.assign(vi.fn(), { url: "/remove" }),
  updateSettingsProfileAction: Object.assign(vi.fn(), { url: "/profile" }),
  uploadProfileAvatarAction: Object.assign(vi.fn(), { url: "/upload" }),
}));
vi.mock("../../lib/profile/account-settings", () => ({
  changePasswordAction: Object.assign((args: unknown) => state.password(args), {
    url: "/password",
  }),
  revokeOtherSessionsAction: Object.assign((args: unknown) => state.revoke(args), {
    url: "/revoke",
  }),
  resendVerificationFromSettingsAction: Object.assign((args: unknown) => state.resend(args), {
    url: "/resend",
  }),
}));
vi.mock("../../lib/auth/server-actions", () => ({
  signOutAction: Object.assign(() => state.signOut(), { url: "/sign-out" }),
}));

import { SettingsPage } from "./settings";

function passwordDraft(current = "OldPass123!", next = "NewPass456!") {
  fireEvent.change(screen.getByLabelText("Current password"), { target: { value: current } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: next } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: next } });
}
const formFor = (label: string) => {
  const form = screen.getByRole("button", { name: label }).closest("form");
  if (!form) throw new Error(`${label} form is missing`);
  return form;
};
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: "account-a", email: "a@example.test", emailVerified: false };
  for (const mock of [state.password, state.revoke, state.resend, state.signOut])
    mock.mockReset().mockResolvedValue({ ok: true });
});

describe("sensitive settings actions", () => {
  it("captures a single POST before validation, retains rejected credentials, and clears only confirmed success", async () => {
    let reject!: (error: Error) => void;
    state.password.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    render(<SettingsPage />);
    passwordDraft();
    const form = formFor("Update password");
    expect(form.getAttribute("action")).toBe("/password");
    expect(form.method).toBe("post");
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    await waitFor(() => expect(state.password).toHaveBeenCalledOnce());
    const data = state.password.mock.calls[0]?.[0].data as FormData;
    expect(data.get("currentPassword")).toBe("OldPass123!");
    expect(data.get("epoch")).toBe("test");
    expect(data.get("__async")).toBe("true");
    expect((screen.getByLabelText("Current password") as HTMLInputElement).readOnly).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Updating password..." }) as HTMLButtonElement).disabled,
    ).toBe(true);
    reject(new Error("private backend detail"));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Password could not be updated",
    );
    expect(screen.queryByText("private backend detail")).toBeNull();
    expect((screen.getByLabelText("Current password") as HTMLInputElement).value).toBe(
      "OldPass123!",
    );
    fireEvent.submit(form);
    await waitFor(() =>
      expect((screen.getByLabelText("Current password") as HTMLInputElement).value).toBe(""),
    );
    expect(screen.getByRole("status").textContent).toContain("Password updated");
  });

  it("retains credentials after a typed failure and associates validation with the field", async () => {
    state.password.mockResolvedValueOnce({ ok: false, message: "Password could not be updated." });
    render(<SettingsPage />);
    passwordDraft();
    fireEvent.submit(formFor("Update password"));
    await screen.findByText("Password could not be updated.");
    expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe("NewPass456!");
    expect(screen.getByLabelText("Current password").getAttribute("aria-describedby")).toContain(
      "password-action-error",
    );
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "Mismatch123!" },
    });
    fireEvent.submit(formFor("Update password"));
    await waitFor(() =>
      expect(screen.getByLabelText("Confirm password").getAttribute("aria-invalid")).toBe("true"),
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Confirm password"));
    expect(state.password).toHaveBeenCalledOnce();
  });

  it("ignores an old account password success while the new account request remains pending", async () => {
    let resolve!: (value: { ok: true }) => void;
    state.password.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const view = render(<SettingsPage />);
    passwordDraft();
    fireEvent.submit(formFor("Update password"));
    await waitFor(() => expect(state.password).toHaveBeenCalledOnce());
    state.user = { ...state.user, id: "account-b", email: "b@example.test" };
    view.rerender(<SettingsPage />);
    expect((screen.getByLabelText("Current password") as HTMLInputElement).value).toBe("");
    passwordDraft("OtherPass123!", "NextPass456!");
    state.password.mockReturnValueOnce(new Promise(() => {}));
    fireEvent.submit(formFor("Update password"));
    await waitFor(() => expect(state.password).toHaveBeenCalledTimes(2));
    await act(async () => {
      resolve({ ok: true });
    });
    expect((screen.getByLabelText("Current password") as HTMLInputElement).value).toBe(
      "OtherPass123!",
    );
    expect((screen.getByLabelText("Current password") as HTMLInputElement).readOnly).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it.each([
    "revoke",
    "resend",
    "signOut",
  ] as const)("makes %s single-flight with announced transport recovery", async (operation) => {
    const label = {
      revoke: "Sign out other sessions",
      resend: "Resend verification",
      signOut: "Sign Out",
    }[operation];
    let reject!: (error: Error) => void;
    state[operation].mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    render(<SettingsPage />);
    const form = formFor(label);
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(state[operation]).toHaveBeenCalledOnce();
    reject(new Error("private transport detail"));
    await screen.findByRole("alert");
    expect(screen.queryByText("private transport detail")).toBeNull();
    expect((screen.getByRole("button", { name: label }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.submit(form);
    await waitFor(() => expect(state[operation]).toHaveBeenCalledTimes(2));
    if (operation === "resend")
      expect((await screen.findByRole("status")).textContent).toBe(
        "If this address can receive verification, a message is on its way.",
      );
  });

  it.each([
    "revoke",
    "resend",
    "signOut",
  ] as const)("keeps a stale %s result out of the new account action state", async (operation) => {
    const label = {
      revoke: "Sign out other sessions",
      resend: "Resend verification",
      signOut: "Sign Out",
    }[operation];
    let resolve!: (value: { ok: true }) => void;
    state[operation].mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const view = render(<SettingsPage />);
    fireEvent.submit(formFor(label));
    state.user = { ...state.user, id: "account-b", email: "b@example.test" };
    view.rerender(<SettingsPage />);
    state[operation].mockReturnValueOnce(new Promise(() => {}));
    fireEvent.submit(formFor(label));
    await act(async () => {
      resolve({ ok: true });
    });
    expect(state[operation]).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
