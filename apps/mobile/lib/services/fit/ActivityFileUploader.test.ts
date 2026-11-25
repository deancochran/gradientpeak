import { fetch as expoFetch } from "expo/fetch";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityFileUploader } from "./ActivityFileUploader";

const mockFiles = new Map<string, { exists: boolean; size: number; type?: string; uri: string }>();

vi.mock("expo-file-system", () => ({
  File: class MockFile {
    exists: boolean;
    size: number;
    type: string;
    uri: string;

    constructor(path: string) {
      const file = mockFiles.get(path) ?? { exists: false, size: 0, uri: path };

      this.exists = file.exists;
      this.size = file.size;
      this.type = file.type ?? "application/fit";
      this.uri = file.uri;
    }

    async bytes() {
      return new Uint8Array([1, 2, 3]);
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

  it("uploads file bytes without letting expo/fetch replace the staging MIME contract", async () => {
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
        headers: expect.objectContaining({
          "Content-Type": "application/octet-stream",
          "x-upsert": "true",
        }),
        body: new Uint8Array([1, 2, 3]),
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

  it("reports only the signed upload HTTP status when Storage rejects the body", async () => {
    mockFiles.set("file:///activity.fit", {
      exists: true,
      size: 128,
      uri: "file:///activity.fit",
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(expoFetch).mockResolvedValue({
      ok: false,
      status: 415,
      clone: () => ({
        json: async () => ({ message: "mime type is not allowed" }),
      }),
    } as never);

    const uploader = new ActivityFileUploader(undefined, undefined, "activity-files", {
      baseRetryDelayMs: 0,
      maxRetries: 0,
    });

    await expect(
      uploader.uploadToSignedUrl(
        "file:///activity.fit",
        "https://storage.example/upload?token=secret",
      ),
    ).resolves.toMatchObject({
      success: false,
      attempts: 1,
      error: "Upload failed: Upload failed with status 415",
    });
    expect(warn).toHaveBeenCalledWith(
      "[ActivityFileUploader] Upload response status 415 category mime_type_rejected",
    );
  });
});
