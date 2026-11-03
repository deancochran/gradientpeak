// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  invalidate: vi.fn(),
  navigate: vi.fn(),
  router: null as unknown,
  actorId: "actor-a" as string | null,
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => mocks.router,
}));

vi.mock("../../lib/coaching/server-functions", () => ({
  createCoachingOrganization: mocks.create,
}));

vi.mock("../providers/auth-provider", () => ({
  useAuth: () => ({ user: mocks.actorId ? { id: mocks.actorId } : null }),
}));

import { OrganizationCreateForm } from "./organization-create-form";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  mocks.router = { invalidate: mocks.invalidate, navigate: mocks.navigate };
  mocks.actorId = "actor-a";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mocks.create.mockReset();
  mocks.invalidate.mockReset();
  mocks.navigate.mockReset();
});

describe("OrganizationCreateForm", () => {
  it("creates and retries with a secure fallback UUID when randomUUID is unavailable", async () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.fill(0x11);
      return bytes;
    });
    vi.stubGlobal("crypto", { getRandomValues });
    mocks.create
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce({ organizationId: firstId });
    render(<OrganizationCreateForm />);

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Summit Coaching" },
    });
    fireEvent.change(screen.getByLabelText("Organization URL name"), {
      target: { value: "summit-coaching" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create organization" }));

    await screen.findByRole("alert");
    const fallbackId = mocks.create.mock.calls[0]?.[0].data.organizationId;
    expect(fallbackId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create organization" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: fallbackId }) }),
    );
    expect(getRandomValues).toHaveBeenCalledOnce();
  });

  it("shows a retryable error without submitting when secure UUID generation fails", async () => {
    const getRandomValues = vi
      .fn<(bytes: Uint8Array) => Uint8Array>()
      .mockImplementationOnce(() => {
        throw new Error("entropy unavailable");
      })
      .mockImplementation((bytes) => {
        bytes.fill(0x22);
        return bytes;
      });
    vi.stubGlobal("crypto", { getRandomValues });
    mocks.create.mockResolvedValueOnce({ organizationId: secondId });
    render(<OrganizationCreateForm />);

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Summit Coaching" },
    });
    fireEvent.change(screen.getByLabelText("Organization URL name"), {
      target: { value: "summit-coaching" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create organization" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/securely prepare/);
    expect(mocks.create).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Create organization" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(mocks.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
          ),
        }),
      }),
    );
  });

  it("retries an uncertain submission with the same organization ID and blocks changed details until a new draft is explicit", async () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValueOnce(firstId).mockReturnValue(secondId),
    });
    mocks.create
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce({ organizationId: firstId })
      .mockResolvedValueOnce({ organizationId: secondId });
    render(
      <StrictMode>
        <OrganizationCreateForm />
      </StrictMode>,
    );

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Summit Coaching" },
    });
    fireEvent.change(screen.getByLabelText("Organization URL name"), {
      target: { value: "summit-coaching" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create organization" }));

    await screen.findByRole("alert");
    expect(mocks.create).toHaveBeenLastCalledWith({
      data: {
        organizationId: firstId,
        name: "Summit Coaching",
        slug: "summit-coaching",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      },
    });

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Changed Coaching" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create organization" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/Check your organizations/),
    );

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Summit Coaching" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create organization" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: firstId }) }),
    );

    await screen.findByRole("button", { name: "Create a new organization from this draft" });
    fireEvent.click(
      screen.getByRole("button", { name: "Create a new organization from this draft" }),
    );
    expect((screen.getByLabelText("Organization name") as HTMLInputElement).value).toBe(
      "Summit Coaching",
    );
    expect((screen.getByLabelText("Organization URL name") as HTMLInputElement).value).toBe(
      "summit-coaching",
    );
    fireEvent.click(screen.getByRole("button", { name: "Create organization" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(3));
    expect(mocks.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: secondId }) }),
    );
  });

  it("keeps a confirmed organization result when cache refresh fails and retries navigation without another create", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue(firstId) });
    mocks.create.mockResolvedValueOnce({ organizationId: firstId });
    mocks.invalidate.mockRejectedValueOnce(new Error("cache unavailable"));
    render(<OrganizationCreateForm />);

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Summit Coaching" },
    });
    fireEvent.change(screen.getByLabelText("Organization URL name"), {
      target: { value: "summit-coaching" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create organization" }));

    expect((await screen.findByRole("status")).textContent).toContain("Organization created");
    expect(screen.getByRole("alert").textContent).toContain("could not open");
    expect(mocks.create).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Open organization dashboard" }));
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/organizations/$organizationId/dashboard",
        params: { organizationId: firstId },
      }),
    );
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it("does not navigate after the authenticated actor changes during invalidation", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue(firstId) });
    let resolveInvalidate: (() => void) | undefined;
    mocks.create.mockResolvedValueOnce({ organizationId: firstId });
    mocks.invalidate.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveInvalidate = resolve;
        }),
    );
    const { rerender } = render(<OrganizationCreateForm />);

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Summit Coaching" },
    });
    fireEvent.change(screen.getByLabelText("Organization URL name"), {
      target: { value: "summit-coaching" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create organization" }));
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledOnce());

    mocks.actorId = "actor-b";
    rerender(<OrganizationCreateForm />);
    resolveInvalidate?.();

    await Promise.resolve();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("uses the current router after replacement while creation is pending", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue(firstId) });
    let resolveCreate: ((value: { organizationId: string }) => void) | undefined;
    let resolveInvalidate: (() => void) | undefined;
    mocks.create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const { rerender } = render(<OrganizationCreateForm />);
    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Summit Coaching" },
    });
    fireEvent.change(screen.getByLabelText("Organization URL name"), {
      target: { value: "summit-coaching" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create organization" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());

    const replacementRouter = {
      invalidate: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveInvalidate = resolve;
          }),
      ),
      navigate: vi.fn(),
    };
    mocks.router = replacementRouter;
    rerender(<OrganizationCreateForm />);
    resolveCreate?.({ organizationId: firstId });

    await waitFor(() => expect(replacementRouter.invalidate).toHaveBeenCalledOnce());
    expect(mocks.invalidate).not.toHaveBeenCalled();
    resolveInvalidate?.();
    await waitFor(() => expect(replacementRouter.navigate).toHaveBeenCalledOnce());
  });

  it("does not navigate after unmount while invalidation is pending", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue(firstId) });
    let resolveInvalidate: (() => void) | undefined;
    mocks.create.mockResolvedValueOnce({ organizationId: firstId });
    mocks.invalidate.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveInvalidate = resolve;
        }),
    );
    const { unmount } = render(<OrganizationCreateForm />);

    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Summit Coaching" },
    });
    fireEvent.change(screen.getByLabelText("Organization URL name"), {
      target: { value: "summit-coaching" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create organization" }));
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledOnce());
    unmount();
    resolveInvalidate?.();

    await Promise.resolve();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("blocks concurrent and committed direct submits until an explicit new draft", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue(firstId) });
    let resolveCreate: ((value: { organizationId: string }) => void) | undefined;
    mocks.create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    mocks.invalidate.mockRejectedValueOnce(new Error("cache unavailable"));
    render(<OrganizationCreateForm />);
    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Summit Coaching" },
    });
    fireEvent.change(screen.getByLabelText("Organization URL name"), {
      target: { value: "summit-coaching" },
    });
    const form = document.querySelector("form");
    form?.requestSubmit();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    form?.requestSubmit();
    expect(mocks.create).toHaveBeenCalledOnce();

    resolveCreate?.({ organizationId: firstId });
    await screen.findByRole("status");
    await screen.findByRole("alert");
    form?.requestSubmit();
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it("retains an in-flight actor operation across a transient signed-out state", async () => {
    const randomUUID = vi.fn().mockReturnValue(firstId);
    vi.stubGlobal("crypto", { randomUUID });
    let resolveCreate: ((value: { organizationId: string }) => void) | undefined;
    mocks.create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const { rerender } = render(<OrganizationCreateForm />);
    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Summit Coaching" },
    });
    fireEvent.change(screen.getByLabelText("Organization URL name"), {
      target: { value: "summit-coaching" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create organization" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());

    mocks.actorId = null;
    rerender(<OrganizationCreateForm />);
    document.querySelector("form")?.requestSubmit();
    expect(mocks.create).toHaveBeenCalledOnce();
    mocks.actorId = "actor-a";
    rerender(<OrganizationCreateForm />);
    resolveCreate?.({ organizationId: firstId });

    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledOnce());
    expect(randomUUID).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: firstId }) }),
    );
  });

  it("reconciles a late transient-session failure with the original UUID", async () => {
    const randomUUID = vi.fn().mockReturnValueOnce(firstId).mockReturnValue(secondId);
    vi.stubGlobal("crypto", { randomUUID });
    let rejectCreate: ((reason?: unknown) => void) | undefined;
    mocks.create.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectCreate = reject;
        }),
    );
    const { rerender } = render(<OrganizationCreateForm />);
    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Summit Coaching" },
    });
    fireEvent.change(screen.getByLabelText("Organization URL name"), {
      target: { value: "summit-coaching" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create organization" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());

    mocks.actorId = null;
    rerender(<OrganizationCreateForm />);
    rejectCreate?.(new Error("connection lost"));
    await Promise.resolve();
    mocks.actorId = "actor-a";
    rerender(<OrganizationCreateForm />);

    await screen.findByRole("alert");
    mocks.create.mockResolvedValueOnce({ organizationId: firstId });
    fireEvent.click(screen.getByRole("button", { name: "Create organization" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: firstId }) }),
    );
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("keeps new-draft unavailable while recovery invalidation is pending", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue(firstId) });
    let resolveInvalidate: (() => void) | undefined;
    mocks.create.mockResolvedValueOnce({ organizationId: firstId });
    mocks.invalidate.mockRejectedValueOnce(new Error("cache unavailable")).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveInvalidate = resolve;
        }),
    );
    render(<OrganizationCreateForm />);
    fireEvent.change(screen.getByLabelText("Organization name"), {
      target: { value: "Summit Coaching" },
    });
    fireEvent.change(screen.getByLabelText("Organization URL name"), {
      target: { value: "summit-coaching" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create organization" }));
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledOnce());
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Open organization dashboard" }));
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledTimes(2));

    const newDraftButton = screen.getByRole("button", {
      name: "Create a new organization from this draft",
    }) as HTMLButtonElement;
    expect(newDraftButton.disabled).toBe(true);
    fireEvent.click(newDraftButton);
    resolveInvalidate?.();

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledOnce());
    expect(mocks.create).toHaveBeenCalledOnce();
  });
});
