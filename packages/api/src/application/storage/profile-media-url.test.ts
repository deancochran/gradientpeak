import { describe, expect, it, vi } from "vitest";

const getPublicUrl = vi.fn((path: string) => ({
  data: {
    publicUrl: `https://storage.example.test/storage/v1/object/public/profile-avatars/${path}`,
  },
}));

vi.mock("../../storage-service", () => ({
  getApiStorageService: () => ({
    storage: { from: () => ({ getPublicUrl }) },
  }),
}));

import { resolveProfileMediaUrl } from "./profile-media-url";

describe("resolveProfileMediaUrl", () => {
  it("preserves canonical HTTP URLs", () => {
    expect(resolveProfileMediaUrl("https://cdn.example.test/avatar.jpg", "profile-1")).toBe(
      "https://cdn.example.test/avatar.jpg",
    );
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it("upgrades a legacy owned storage path to its public URL", () => {
    expect(resolveProfileMediaUrl("profile-1/123.jpg", "profile-1")).toBe(
      "https://storage.example.test/storage/v1/object/public/profile-avatars/profile-1/123.jpg",
    );
  });

  it("rejects relative paths that do not belong to the profile", () => {
    expect(resolveProfileMediaUrl("another-profile/123.jpg", "profile-1")).toBeNull();
  });

  it.each([
    "profile-1/%2e%2e/other/avatar.jpg",
    "profile-1/%2Fother/avatar.jpg",
    "profile-1/..\\other/avatar.jpg",
  ])("rejects encoded or alternate path traversal: %s", (path) => {
    expect(resolveProfileMediaUrl(path, "profile-1")).toBeNull();
  });
});
