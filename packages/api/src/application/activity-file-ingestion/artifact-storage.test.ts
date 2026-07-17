import { describe, expect, it, vi } from "vitest";
import {
  activityArtifactContentPath,
  promoteActivityArtifact,
  verifyAcceptedActivityArtifact,
} from "./artifact-storage";

function storage(input?: {
  uploadError?: { message: string; statusCode?: number };
  destination?: Uint8Array;
}) {
  const source = new Uint8Array([1, 2, 3]);
  const destination = input?.destination ?? source;
  const upload = vi.fn().mockResolvedValue({ error: input?.uploadError ?? null });
  const download = vi.fn().mockResolvedValue({
    data: { arrayBuffer: async () => destination.buffer },
    error: null,
  });
  return {
    source,
    upload,
    service: { storage: { from: vi.fn(() => ({ upload, download, remove: vi.fn() })) } },
  };
}

describe("activity artifact promotion", () => {
  it("conditionally writes and verifies the immutable content path", async () => {
    const fake = storage();
    const result = await promoteActivityArtifact(fake.service, {
      profileId: "profile-1",
      bucket: "activity-files",
      stagingPath: "uploads/mutable.fit",
      bytes: fake.source,
      format: "fit",
    });
    expect(result.path).toBe(activityArtifactContentPath("profile-1", result.sha256));
    expect(result.path).not.toBe(result.stagingPath);
    expect(fake.upload).toHaveBeenCalledWith(result.path, fake.source, {
      contentType: "application/octet-stream",
      upsert: false,
    });
  });

  it("reuses a conflicting destination only when bytes verify", async () => {
    const matching = storage({ uploadError: { message: "already exists", statusCode: 409 } });
    await expect(
      promoteActivityArtifact(matching.service, {
        profileId: "profile-1",
        bucket: "activity-files",
        stagingPath: "uploads/mutable.fit",
        bytes: matching.source,
        format: "fit",
      }),
    ).resolves.toMatchObject({ byteSize: 3 });

    const mismatched = storage({
      uploadError: { message: "already exists", statusCode: 409 },
      destination: new Uint8Array([9, 9, 9]),
    });
    await expect(
      promoteActivityArtifact(mismatched.service, {
        profileId: "profile-1",
        bucket: "activity-files",
        stagingPath: "uploads/mutable.fit",
        bytes: mismatched.source,
        format: "fit",
      }),
    ).rejects.toThrow("does not match source bytes");
  });

  it("rejects client metadata when profile path or destination bytes do not verify", async () => {
    const fake = storage();
    const sha256 = "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81";
    await expect(
      verifyAcceptedActivityArtifact(fake.service, {
        profileId: "profile-1",
        sha256,
        byteSize: 3,
        bucket: "activity-files",
        path: activityArtifactContentPath("profile-2", sha256),
        mediaType: "application/octet-stream",
        format: "fit",
      }),
    ).rejects.toThrow("does not match profile and digest");

    const mismatched = storage({ destination: new Uint8Array([9, 9, 9]) });
    await expect(
      verifyAcceptedActivityArtifact(mismatched.service, {
        profileId: "profile-1",
        sha256,
        byteSize: 3,
        bucket: "activity-files",
        path: activityArtifactContentPath("profile-1", sha256),
        mediaType: "application/octet-stream",
        format: "fit",
      }),
    ).rejects.toThrow("does not match source bytes");
  });
});
