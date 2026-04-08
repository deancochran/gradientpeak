import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { storageState } = vi.hoisted(() => ({
  storageState: {
    createSignedUploadUrl: vi.fn(async (path: string) => ({
      data: { signedUrl: `https://upload.test/${path}`, path },
      error: null,
    })),
    getPublicUrl: vi.fn((path: string) => ({
      data: { publicUrl: `https://public.test/${path}` },
    })),
    createSignedUrl: vi.fn(async (path: string) => ({
      data: { signedUrl: `https://download.test/${path}` },
      error: null,
    })),
    remove: vi.fn(async () => ({ error: null })),
  },
}));

vi.mock("../../storage-service", () => ({
  getApiStorageService: () => ({
    storage: {
      from: () => ({
        createSignedUploadUrl: storageState.createSignedUploadUrl,
        getPublicUrl: storageState.getPublicUrl,
        createSignedUrl: storageState.createSignedUrl,
        remove: storageState.remove,
      }),
    },
  }),
}));

import { storageRouter } from "../storage";

function createCaller(userId = "11111111-1111-4111-8111-111111111111") {
  return storageRouter.createCaller({
    session: { user: { id: userId } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);
}

describe("storageRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a public URL alongside signed upload data", async () => {
    const caller = createCaller();

    const result = await caller.createSignedUploadUrl({
      fileName: "avatar.png",
      fileType: "image/png",
    });

    expect(result.path).toMatch(/^11111111-1111-4111-8111-111111111111\//);
    expect(result.publicUrl).toBe(`https://public.test/${result.path}`);
  });

  it("rejects upload requests when file extension does not match MIME type", async () => {
    const caller = createCaller();

    await expect(
      caller.createSignedUploadUrl({
        fileName: "avatar.png",
        fileType: "image/jpeg",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } as Partial<TRPCError>);

    expect(storageState.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects upload requests with path separators in the file name", async () => {
    const caller = createCaller();

    await expect(
      caller.createSignedUploadUrl({
        fileName: "nested/avatar.png",
        fileType: "image/png",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } as Partial<TRPCError>);

    expect(storageState.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects malformed signed upload responses from storage", async () => {
    storageState.getPublicUrl.mockReturnValueOnce({
      data: { publicUrl: "not-a-valid-url" },
    });

    const caller = createCaller();

    await expect(
      caller.createSignedUploadUrl({
        fileName: "avatar.png",
        fileType: "image/png",
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" } as Partial<TRPCError>);
  });

  it("returns a signed download URL for the current user's avatar", async () => {
    const caller = createCaller();
    const filePath = "11111111-1111-4111-8111-111111111111/avatar.png";

    const result = await caller.getSignedUrl({ filePath });

    expect(result).toEqual({ signedUrl: `https://download.test/${filePath}` });
    expect(storageState.createSignedUrl).toHaveBeenCalledWith(filePath, 3600);
  });

  it("rejects signed download requests for another user's avatar", async () => {
    const caller = createCaller();

    await expect(
      caller.getSignedUrl({
        filePath: "22222222-2222-4222-8222-222222222222/avatar.png",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } as Partial<TRPCError>);
  });

  it("deletes a file owned by the current user", async () => {
    const caller = createCaller();
    const filePath = "11111111-1111-4111-8111-111111111111/avatar.png";

    const result = await caller.deleteFile({ filePath });

    expect(result).toEqual({ success: true });
    expect(storageState.remove).toHaveBeenCalledWith([filePath]);
  });

  it("rejects deletion requests for another user's file", async () => {
    const caller = createCaller();

    await expect(
      caller.deleteFile({
        filePath: "22222222-2222-4222-8222-222222222222/avatar.png",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } as Partial<TRPCError>);

    expect(storageState.remove).not.toHaveBeenCalled();
  });

  it("rejects deletion requests for paths that only share a user id prefix", async () => {
    const caller = createCaller();

    await expect(
      caller.deleteFile({
        filePath: "11111111-1111-4111-8111-111111111111-malicious/avatar.png",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } as Partial<TRPCError>);

    expect(storageState.remove).not.toHaveBeenCalled();
  });
});
