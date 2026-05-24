import { fetch as expoFetch } from "expo/fetch";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityFileUploader } from "./ActivityFileUploader";

const mockFiles = new Map<string, { exists: boolean; size: number; uri: string }>();

vi.mock("expo-file-system", () => ({
  File: class MockFile {
    exists: boolean;
    size: number;
    uri: string;

    constructor(path: string) {
      const file = mockFiles.get(path) ?? { exists: false, size: 0, uri: path };

      this.exists = file.exists;
      this.size = file.size;
      this.uri = file.uri;
    }
  },
}));

vi.mock("expo/fetch", () => ({
  fetch: vi.fn(),
}));

describe("ActivityFileUploader", () => {
  beforeEach(() => {
    mockFiles.clear();
    vi.mocked(expoFetch).mockReset();
  });

  it("uploads the Expo File object directly to avoid local file URI fetch failures", async () => {
    mockFiles.set("file:///activity.fit", {
      exists: true,
      size: 128,
      uri: "file:///activity.fit",
    });
    vi.mocked(expoFetch).mockResolvedValue({ ok: true } as never);

    const uploader = new ActivityFileUploader(undefined, undefined, "activity-files", {
      maxRetries: 0,
    });

    const result = await uploader.uploadToSignedUrl(
      "file:///activity.fit",
      "https://storage.example/upload",
    );

    expect(result).toMatchObject({ success: true, attempts: 1 });
    expect(expoFetch).toHaveBeenCalledWith(
      "https://storage.example/upload",
      expect.objectContaining({
        method: "PUT",
        body: expect.objectContaining({ uri: "file:///activity.fit" }),
      }),
    );
  });

  it("returns a failed result when the signed upload transport fails", async () => {
    mockFiles.set("file:///activity.fit", {
      exists: true,
      size: 128,
      uri: "file:///activity.fit",
    });
    vi.mocked(expoFetch).mockRejectedValue(new Error("Network request failed"));

    const uploader = new ActivityFileUploader(undefined, undefined, "activity-files", {
      baseRetryDelayMs: 0,
      maxRetries: 0,
    });

    const result = await uploader.uploadToSignedUrl(
      "file:///activity.fit",
      "https://storage.example/upload",
    );

    expect(result).toMatchObject({
      success: false,
      attempts: 1,
      error: "Upload failed: Network request failed",
    });
  });
});
