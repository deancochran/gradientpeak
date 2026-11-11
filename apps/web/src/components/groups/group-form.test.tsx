// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GroupForm } from "./group-form";

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock("../../lib/api/client", () => ({
  api: {
    storage: { createSignedUploadUrl: { useMutation: () => ({ mutateAsync: mocks.mutateAsync }) } },
  },
}));
vi.mock("../../lib/use-unsaved-changes-guard", () => ({
  useUnsavedChangesGuard: () => ({
    guardedCancel: (callback: () => void) => callback(),
    markSaved: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mocks.mutateAsync.mockReset();
});

describe("GroupForm image recovery", () => {
  it("retains a failed create draft, blocks entity save, and only clears its upload error after retry succeeds", async () => {
    const submit = vi.fn(async () => undefined);
    mocks.mutateAsync.mockResolvedValue({
      publicUrl: "https://images.example.test/cover.jpg",
      signedUrl: "https://uploads.example.test/cover.jpg",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false })),
    );
    render(
      <GroupForm
        isSubmitting={false}
        onCancel={vi.fn()}
        onSubmit={submit}
        submitLabel="Create group"
      />,
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New group" } });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "New description" },
    });
    fireEvent.change(screen.getByLabelText("Cover photo"), {
      target: { files: [new File(["image"], "cover.jpg", { type: "image/jpeg" })] },
    });

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Image upload failed."),
    );
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("New group");
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe(
      "New description",
    );
    expect(
      (screen.getByRole("button", { name: "Create group" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    expect(submit).not.toHaveBeenCalled();

    let resolveRetry!: (value: { publicUrl: string; signedUrl: string }) => void;
    mocks.mutateAsync.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRetry = resolve;
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry cover upload" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry cover upload" }));
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("alert").textContent).toContain("Image upload failed.");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true })),
    );
    resolveRetry({
      publicUrl: "https://images.example.test/cover.jpg",
      signedUrl: "https://uploads.example.test/cover.jpg",
    });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByAltText("Group cover preview")).toBeTruthy();
  });

  it("preserves nullable cover and privacy values after a rejected edit upload", async () => {
    const submit = vi.fn(async () => undefined);
    mocks.mutateAsync.mockResolvedValue({
      publicUrl: "https://images.example.test/avatar.jpg",
      signedUrl: "https://uploads.example.test/avatar.jpg",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false })),
    );
    render(
      <GroupForm
        group={{
          access_level: "members_only",
          avatar_url: null,
          cover_url: null,
          description: "Private description",
          id: "group-1",
          join_policy: "invite_only",
          name: "Private group",
          slug: "private-group",
        }}
        isSubmitting={false}
        onCancel={vi.fn()}
        onSubmit={submit}
        submitLabel="Save changes"
      />,
    );
    fireEvent.change(screen.getByLabelText("Avatar"), {
      target: { files: [new File(["image"], "avatar.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Keep current image" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        access_level: "members_only",
        avatar_url: null,
        cover_url: null,
        description: "Private description",
        join_policy: "invite_only",
        name: "Private group",
      }),
    );
  });
});
