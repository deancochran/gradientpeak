// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  complete: vi.fn(
    async (_input: { data: FormData }): Promise<{ status: string } | undefined> => ({
      status: "ok",
    }),
  ),
  loaderData: {
    draft: { full_name: "Web Athlete", username: "web_athlete" },
    integrations: [],
    integrationsError: null,
    profile: { onboarding_status: "provider_selection" },
    progress: { status: "provider_selection" },
    progressError: null,
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => mocks.loaderData,
    useNavigate: () => vi.fn(),
    useSearch: () => ({}),
  }),
  redirect: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("../components/onboarding/provider-onboarding", () => ({
  ProviderProcessingState: () => null,
  ProviderSelectionStep: () => <div>Optional provider controls</div>,
}));
vi.mock("../components/route-flash-toast", () => ({ RouteFlashToast: () => null }));
vi.mock("../lib/api/client", () => ({
  api: { integrations: { getAuthUrl: { useMutation: () => ({ isPending: false }) } } },
}));
vi.mock("../lib/auth/route-guards", () => ({
  authSessionMiddleware: {},
  resolveRouteAuthSession: vi.fn(),
}));
vi.mock("../lib/contract-epoch", () => ({ contractEpochFormInputProps: {} }));
vi.mock("../lib/onboarding/lifecycle-load-state", () => ({
  resolveLoadedOnboardingStatus: () => "provider_selection",
}));
vi.mock("../lib/onboarding/oauth-error", () => ({
  getOnboardingOAuthErrorMessage: vi.fn(),
  parseOnboardingOAuthError: vi.fn(),
}));
vi.mock("../lib/onboarding/progress-poll", () => ({ pollOnboardingProgress: vi.fn() }));
vi.mock("../lib/onboarding/provider-connection", () => ({
  startOnboardingProviderConnection: vi.fn(),
}));
vi.mock("../lib/onboarding/server-actions", () => ({
  cancelPendingOnboardingOAuthAction: vi.fn(),
  completeOnboardingIdentityAction: Object.assign(mocks.complete, { url: "/onboarding" }),
  loadOnboardingOptions: vi.fn(),
  loadOnboardingProgress: vi.fn(),
  restartOnboardingProviderSelectionAction: vi.fn(),
  retryOnboardingProviderAction: vi.fn(),
}));

import { OnboardingPage } from "./onboarding";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("simplified web onboarding", () => {
  it("does not throw when successful navigation consumes the server redirect result", async () => {
    mocks.complete.mockResolvedValueOnce(undefined);
    render(<OnboardingPage />);
    const button = screen.getByRole("button", { name: "Finish setup" });
    const form = button.closest("form");
    if (!form) throw new Error("Onboarding form missing");
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.complete).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the identity draft and explains an unconfirmed submit after a server-function rejection", async () => {
    mocks.complete.mockRejectedValueOnce(new Error("Network unavailable"));
    render(<OnboardingPage />);

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Updated Athlete" } });
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "updated_athlete" } });
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));

    expect(
      await screen.findByText(
        "We couldn't confirm whether setup finished. Your details are still here. Refresh this page before trying again.",
      ),
    ).toBeTruthy();
    expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe("Updated Athlete");
    expect((screen.getByLabelText("Username") as HTMLInputElement).value).toBe("updated_athlete");
    expect(screen.getByRole("button", { name: "Finish setup" }).hasAttribute("disabled")).toBe(
      false,
    );
  });

  it("does not start a second submit while the first server-function call is pending", async () => {
    let resolveCompletion: ((result: { status: string }) => void) | undefined;
    mocks.complete.mockImplementationOnce(
      () =>
        new Promise<{ status: string }>((resolve) => {
          resolveCompletion = resolve;
        }),
    );
    render(<OnboardingPage />);

    const button = screen.getByRole("button", { name: "Finish setup" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(mocks.complete).toHaveBeenCalledTimes(1);
    expect(button.hasAttribute("disabled")).toBe(true);

    resolveCompletion?.({ status: "ok" });
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
  });

  it("renders identity, optional provider controls, and no removed initial setup sections", async () => {
    render(<OnboardingPage />);

    expect(screen.getByRole("heading", { name: "Finish your profile" })).toBeTruthy();
    expect(screen.getByLabelText("Full name")).toBeTruthy();
    expect(screen.getByLabelText("Username")).toBeTruthy();
    expect(screen.getByText("Optional provider controls")).toBeTruthy();
    expect(screen.queryByText("Training baseline")).toBeNull();
    expect(screen.queryByText("Training preferences")).toBeNull();
    expect(screen.queryByText(/Initial goal/)).toBeNull();
    expect(screen.queryByText("Groups and people")).toBeNull();

    const form = screen.getByRole("button", { name: "Finish setup" }).closest("form");
    expect(form).not.toBeNull();
    if (!form) return;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.complete).toHaveBeenCalledTimes(1));
    const formData = mocks.complete.mock.calls[0]?.[0]?.data as FormData;
    expect(formData.get("full_name")).toBe("Web Athlete");
    expect(formData.get("username")).toBe("web_athlete");
    expect(formData.get("goal_title")).toBeNull();
  });
});
