// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

class ResizeObserverMock {
  disconnect() {}
  observe() {}
  unobserve() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

const state = vi.hoisted(() => ({
  profile: undefined as Record<string, unknown> | undefined,
  user: { id: "account-a", email: "a@example.test", emailVerified: true } as Record<
    string,
    unknown
  > | null,
  removeMedia: vi.fn<(args: unknown) => Promise<{ field: string }>>(async () => ({
    field: "avatar_url",
  })),
  save: vi.fn<(args: unknown) => Promise<void>>(async () => {}),
  uploadMedia: vi.fn<(args: unknown) => Promise<{ field: string; url: string }>>(async () => ({
    field: "avatar_url",
    url: "https://images.example.test/new.jpg",
  })),
}));
let blockerOptions:
  | { enableBeforeUnload?: () => boolean; shouldBlockFn?: () => boolean }
  | undefined;

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useNavigate: () => vi.fn(),
    useSearch: () => ({}),
  }),
  isRedirect: () => false,
  useBlocker: (options: typeof blockerOptions) => {
    blockerOptions = options;
  },
}));
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
    profiles: { get: { useQuery: () => ({ data: state.profile, isLoading: false }) } },
    storage: { getSignedUrl: { useQuery: () => ({ data: undefined }) } },
  },
}));
vi.mock("../../lib/contract-epoch", () => ({ contractEpochFormInputProps: {} }));
vi.mock("../../lib/auth/server-actions", () => ({ signOutAction: { url: "/sign-out" } }));
vi.mock("../../lib/profile/account-settings", () => ({
  changePasswordAction: { url: "/change-password" },
  resendVerificationFromSettingsAction: { url: "/resend-verification" },
  revokeOtherSessionsAction: { url: "/revoke" },
}));
vi.mock("../../lib/profile/server-actions", () => ({
  removeProfileImageAction: { url: "/remove-image", kind: "remove" },
  updateSettingsProfileAction: { url: "/update-profile" },
  uploadProfileAvatarAction: { url: "/upload-image", kind: "upload" },
}));
vi.mock("../../lib/use-form-server-fn", () => ({
  useFormServerFn: (action: { kind?: string }, onSuccess: () => void) => async (args: unknown) => {
    const result =
      action.kind === "upload"
        ? await state.uploadMedia(args)
        : action.kind === "remove"
          ? await state.removeMedia(args)
          : await state.save(args);
    onSuccess();
    return result;
  },
}));

import { SettingsPage } from "./settings";

const profile = (id: string, full_name: string, bio: string) => ({
  avatar_url: null,
  bio,
  cover_url: null,
  created_at: "2026-01-01T00:00:00.000Z",
  default_content_visibility: "private",
  dob: null,
  full_name,
  is_public: false,
  id,
  language: null,
  planning_timezone: null,
  preferred_units: "metric",
  username: full_name.toLowerCase().replaceAll(" ", "_"),
});

function getProfileForm() {
  const form = screen.getByText("Update Profile").closest("form");
  if (!form) throw new Error("Profile form is missing");
  return form;
}

afterEach(() => {
  cleanup();
  state.profile = undefined;
  state.user = { id: "account-a", email: "a@example.test", emailVerified: true };
  state.save.mockReset();
  state.save.mockResolvedValue(undefined);
  state.uploadMedia.mockReset();
  state.uploadMedia.mockResolvedValue({
    field: "avatar_url",
    url: "https://images.example.test/new.jpg",
  });
  state.removeMedia.mockReset();
  state.removeMedia.mockResolvedValue({ field: "avatar_url" });
  blockerOptions = undefined;
  vi.clearAllMocks();
});

describe("SettingsPage profile synchronization", () => {
  it("preserves dirty values, refreshes untouched values, and clears the prior account draft", async () => {
    state.profile = profile("account-a", "Server A", "Original bio");
    const rendered = render(<SettingsPage />);
    await waitFor(() =>
      expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe("Server A"),
    );

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Edited A" } });
    state.profile = profile("account-a", "Refreshed A", "Refreshed bio");
    rendered.rerender(<SettingsPage />);

    await waitFor(() => {
      expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe("Edited A");
      expect((screen.getByLabelText("Bio") as HTMLTextAreaElement).value).toBe("Refreshed bio");
    });

    state.user = { id: "account-b", email: "b@example.test", emailVerified: true };
    state.profile = undefined;
    rendered.rerender(<SettingsPage />);
    await waitFor(() =>
      expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe(""),
    );

    state.profile = profile("account-b", "Server B", "Account B bio");
    rendered.rerender(<SettingsPage />);
    await waitFor(() => {
      expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe("Server B");
      expect((screen.getByLabelText("Bio") as HTMLTextAreaElement).value).toBe("Account B bio");
    });
  });

  it("retains a rejected draft and keeps the browser and navigation guards active", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    state.profile = profile("account-a", "Server A", "Original bio");
    let rejectSave!: (reason: Error) => void;
    state.save.mockReturnValue(
      new Promise<void>((_resolve, reject) => {
        rejectSave = reject;
      }),
    );
    render(<SettingsPage />);
    const fullName = await screen.findByLabelText("Full name");
    fireEvent.change(fullName, { target: { value: "Draft A" } });

    fireEvent.submit(getProfileForm());
    await waitFor(() => expect(state.save).toHaveBeenCalledOnce());
    rejectSave(new Error("Profile service unavailable"));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Profile service unavailable"),
    );
    expect((fullName as HTMLInputElement).value).toBe("Draft A");
    expect(blockerOptions?.enableBeforeUnload?.()).toBe(true);
    expect(blockerOptions?.shouldBlockFn?.()).toBe(true);
  });

  it("accepts one rapid submit, then disarms guards only after the server confirms success", async () => {
    state.profile = profile("account-a", "Server A", "Original bio");
    let resolveSave!: () => void;
    state.save.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
    );
    render(<SettingsPage />);
    fireEvent.change(await screen.findByLabelText("Full name"), { target: { value: "Draft A" } });
    const form = getProfileForm();
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(state.save).toHaveBeenCalledOnce());
    expect(blockerOptions?.enableBeforeUnload?.()).toBe(true);

    resolveSave();
    await waitFor(() => expect(blockerOptions?.enableBeforeUnload?.()).toBe(false));
  });

  it("does not let an old account completion disarm a new account draft", async () => {
    state.profile = profile("account-a", "Server A", "Original bio");
    let resolveSave!: () => void;
    state.save.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
    );
    const rendered = render(<SettingsPage />);
    fireEvent.change(await screen.findByLabelText("Full name"), { target: { value: "Draft A" } });
    fireEvent.submit(getProfileForm());
    await waitFor(() => expect(state.save).toHaveBeenCalledOnce());

    state.user = { id: "account-b", email: "b@example.test", emailVerified: true };
    state.profile = profile("account-b", "Server B", "Original bio");
    rendered.rerender(<SettingsPage />);
    const fullName = await screen.findByLabelText("Full name");
    await waitFor(() => expect((fullName as HTMLInputElement).value).toBe("Server B"));
    fireEvent.change(fullName, { target: { value: "Draft B" } });
    resolveSave();

    await waitFor(() => expect((fullName as HTMLInputElement).value).toBe("Draft B"));
    expect(blockerOptions?.enableBeforeUnload?.()).toBe(true);
  });

  it("does not display a prior account's media while the next profile loads", async () => {
    state.profile = {
      ...profile("account-a", "Server A", "Original bio"),
      avatar_url: "https://images.example.test/account-a-avatar.jpg",
      cover_url: "https://images.example.test/account-a-cover.jpg",
    };
    const rendered = render(<SettingsPage />);
    expect(await screen.findByAltText("Profile cover")).toBeTruthy();

    state.user = { id: "account-b", email: "b@example.test", emailVerified: true };
    rendered.rerender(<SettingsPage />);

    await waitFor(() => expect(screen.queryByAltText("Profile cover")).toBeNull());
  });

  it("retains a failed avatar selection and the server image, while allowing only one request", async () => {
    state.profile = {
      ...profile("account-a", "Server A", "Original bio"),
      avatar_url: "https://images.example.test/account-a-avatar.jpg",
    };
    let rejectUpload!: (reason: Error) => void;
    state.uploadMedia.mockReturnValue(
      new Promise((_, reject) => {
        rejectUpload = reject;
      }),
    );
    render(<SettingsPage />);
    const input = await screen.findByLabelText("Avatar upload");
    const selected = new File(["image"], "avatar.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [selected] } });

    const upload = screen.getByRole("button", { name: "Upload Avatar" });
    fireEvent.click(upload);
    fireEvent.click(upload);
    await waitFor(() => expect(state.uploadMedia).toHaveBeenCalledOnce());
    expect(screen.getByRole("status").textContent).toContain("Uploading avatar");
    expect(screen.getByRole("button", { name: "Remove Avatar" })).toBeTruthy();

    rejectUpload(new Error("Upload unavailable"));
    expect((await screen.findByRole("alert")).textContent).toContain("Upload unavailable");
    expect(screen.getByText(/avatar\.jpg/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Avatar" })).toBeTruthy();
  });

  it("keeps a server avatar visible when removal fails and ignores an old account upload result", async () => {
    state.profile = {
      ...profile("account-a", "Server A", "Original bio"),
      avatar_url: "https://images.example.test/account-a-avatar.jpg",
    };
    let resolveUpload!: (value: { field: string; url: string }) => void;
    state.uploadMedia.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    state.removeMedia.mockRejectedValue(new Error("Removal unavailable"));
    const rendered = render(<SettingsPage />);
    const input = await screen.findByLabelText("Avatar upload");
    fireEvent.change(input, {
      target: { files: [new File(["image"], "avatar.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload Avatar" }));

    state.user = { id: "account-b", email: "b@example.test", emailVerified: true };
    state.profile = profile("account-b", "Server B", "Original bio");
    rendered.rerender(<SettingsPage />);
    resolveUpload({ field: "avatar_url", url: "https://images.example.test/account-a-new.jpg" });
    await waitFor(() => expect(screen.queryByText(/avatar\.jpg/)).toBeNull());
    expect(screen.queryByAltText("Profile cover")).toBeNull();

    state.user = { id: "account-a", email: "a@example.test", emailVerified: true };
    state.profile = {
      ...profile("account-a", "Server A", "Original bio"),
      avatar_url: "https://images.example.test/account-a-avatar.jpg",
    };
    rendered.rerender(<SettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Avatar" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Removal unavailable");
    expect(screen.getByRole("button", { name: "Remove Avatar" })).toBeTruthy();
  });
});
