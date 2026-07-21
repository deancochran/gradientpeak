import { describe, expect, it, vi } from "vitest";

import {
  extractOwnedProfileMediaPath,
  ProfileMediaConflictError,
  ProfileMediaPartialFailureError,
  removeProfileMedia,
  replaceProfileMedia,
} from "./profile-media";

const bucketPublicUrl = "https://project.supabase.co/storage/v1/object/public/profile-avatars/";
const userId = "user-123";

function publicUrl(path: string) {
  return `${bucketPublicUrl}${path}`;
}

function profile(avatarUrl: string | null = null, coverUrl: string | null = null) {
  return { avatar_url: avatarUrl, cover_url: coverUrl };
}

function createConcurrentLoadProfile(getCurrent: () => string | null) {
  let loaded = 0;
  let release!: () => void;
  const bothLoaded = new Promise<void>((resolve) => {
    release = resolve;
  });

  return async () => {
    const snapshot = profile(getCurrent());
    loaded += 1;
    if (loaded === 2) release();
    await bothLoaded;
    return snapshot;
  };
}

function createMediaStore(initialUrl: string | null, initialPaths: string[]) {
  const store = {
    currentUrl: initialUrl,
    objects: new Set(initialPaths),
    deletedWhileCurrent: [] as string[],
  };

  return {
    store,
    compareAndSwapProfile: async (
      _field: "avatar_url" | "cover_url",
      expected: string | null,
      next: string | null,
    ) => {
      if (store.currentUrl !== expected) throw new ProfileMediaConflictError();
      store.currentUrl = next;
    },
    removeObject: async (path: string) => {
      if (store.currentUrl === publicUrl(path)) store.deletedWhileCurrent.push(path);
      store.objects.delete(path);
    },
  };
}

describe("extractOwnedProfileMediaPath", () => {
  it.each([
    ["an external URL", "https://images.example.com/user-123/avatar-old.jpg"],
    ["another user's path", publicUrl("user-456/avatar-old.jpg")],
    ["the wrong image field", publicUrl("user-123/cover-old.jpg")],
    ["malformed encoding", `${bucketPublicUrl}user-123/avatar-%E0%A4%A`],
  ])("rejects %s", (_label, candidate) => {
    expect(
      extractOwnedProfileMediaPath({
        publicUrl: candidate,
        bucketPublicUrl,
        userId,
        field: "avatar_url",
      }),
    ).toBeNull();
  });

  it("returns only the decoded path for an owned field object", () => {
    expect(
      extractOwnedProfileMediaPath({
        publicUrl: publicUrl("user-123/avatar-new%20image.jpg"),
        bucketPublicUrl,
        userId,
        field: "avatar_url",
      }),
    ).toBe("user-123/avatar-new image.jpg");
  });
});

describe("replaceProfileMedia", () => {
  it("updates the profile and then removes the previous owned object", async () => {
    const oldUrl = publicUrl("user-123/avatar-old.jpg");
    const newUrl = publicUrl("user-123/avatar-new.jpg");
    const calls: string[] = [];
    const compareAndSwapProfile = vi.fn(async () => {
      calls.push("update");
    });
    const removeObject = vi.fn(async () => {
      calls.push("remove-old");
    });

    await replaceProfileMedia({
      userId,
      field: "avatar_url",
      bucketPublicUrl,
      newPath: "user-123/avatar-new.jpg",
      loadProfile: async () => {
        calls.push("load");
        return profile(oldUrl);
      },
      upload: async () => {
        calls.push("upload");
      },
      getPublicUrl: () => newUrl,
      compareAndSwapProfile,
      removeObject,
    });

    expect(calls).toEqual(["load", "upload", "update", "remove-old"]);
    expect(compareAndSwapProfile).toHaveBeenCalledWith("avatar_url", oldUrl, newUrl);
    expect(removeObject).toHaveBeenCalledWith("user-123/avatar-old.jpg");
  });

  it("removes the new object when the profile update fails", async () => {
    const primaryError = new Error("database unavailable");
    const removeObject = vi.fn(async () => undefined);

    await expect(
      replaceProfileMedia({
        userId,
        field: "avatar_url",
        bucketPublicUrl,
        newPath: "user-123/avatar-new.jpg",
        loadProfile: async () => profile(),
        upload: async () => undefined,
        getPublicUrl: () => publicUrl("user-123/avatar-new.jpg"),
        compareAndSwapProfile: async () => {
          throw primaryError;
        },
        removeObject,
      }),
    ).rejects.toBe(primaryError);

    expect(removeObject).toHaveBeenCalledWith("user-123/avatar-new.jpg");
  });

  it("cleans the new object and surfaces a stable retry error on initial CAS conflict", async () => {
    const removeObject = vi.fn(async () => undefined);

    await expect(
      replaceProfileMedia({
        userId,
        field: "avatar_url",
        bucketPublicUrl,
        newPath: "user-123/avatar-new.jpg",
        loadProfile: async () => profile(publicUrl("user-123/avatar-old.jpg")),
        upload: async () => undefined,
        getPublicUrl: () => publicUrl("user-123/avatar-new.jpg"),
        compareAndSwapProfile: async () => {
          throw new ProfileMediaConflictError();
        },
        removeObject,
      }),
    ).rejects.toMatchObject({
      name: "ProfileMediaConflictError",
      message: "Profile image changed. Please retry.",
    });

    expect(removeObject).toHaveBeenCalledWith("user-123/avatar-new.jpg");
  });

  it("removes the new object when its public URL is not the expected owned path", async () => {
    const compareAndSwapProfile = vi.fn(async () => undefined);
    const removeObject = vi.fn(async () => undefined);

    await expect(
      replaceProfileMedia({
        userId,
        field: "avatar_url",
        bucketPublicUrl,
        newPath: "user-123/avatar-new.jpg",
        loadProfile: async () => profile(),
        upload: async () => undefined,
        getPublicUrl: () => "https://images.example.com/avatar-new.jpg",
        compareAndSwapProfile,
        removeObject,
      }),
    ).rejects.toThrow("Profile image URL validation failed");

    expect(compareAndSwapProfile).not.toHaveBeenCalled();
    expect(removeObject).toHaveBeenCalledWith("user-123/avatar-new.jpg");
  });

  it("preserves the primary profile update error when new-object cleanup also fails", async () => {
    const primaryError = new Error("database unavailable");

    await expect(
      replaceProfileMedia({
        userId,
        field: "avatar_url",
        bucketPublicUrl,
        newPath: "user-123/avatar-new.jpg",
        loadProfile: async () => profile(),
        upload: async () => undefined,
        getPublicUrl: () => publicUrl("user-123/avatar-new.jpg"),
        compareAndSwapProfile: async () => {
          throw primaryError;
        },
        removeObject: async () => {
          throw new Error("storage unavailable");
        },
      }),
    ).rejects.toBe(primaryError);
  });

  it("restores the previous URL and removes the new object when old-object deletion fails", async () => {
    const oldUrl = publicUrl("user-123/avatar-old.jpg");
    const newUrl = publicUrl("user-123/avatar-new.jpg");
    const compareAndSwapProfile = vi.fn(async () => undefined);
    const removeObject = vi.fn(async (path: string) => {
      if (path.endsWith("avatar-old.jpg")) {
        throw new Error("storage unavailable");
      }
    });

    await expect(
      replaceProfileMedia({
        userId,
        field: "avatar_url",
        bucketPublicUrl,
        newPath: "user-123/avatar-new.jpg",
        loadProfile: async () => profile(oldUrl),
        upload: async () => undefined,
        getPublicUrl: () => newUrl,
        compareAndSwapProfile,
        removeObject,
      }),
    ).rejects.toBeInstanceOf(ProfileMediaPartialFailureError);

    expect(compareAndSwapProfile).toHaveBeenNthCalledWith(1, "avatar_url", oldUrl, newUrl);
    expect(compareAndSwapProfile).toHaveBeenNthCalledWith(2, "avatar_url", newUrl, oldUrl);
    expect(removeObject).toHaveBeenNthCalledWith(1, "user-123/avatar-old.jpg");
    expect(removeObject).toHaveBeenNthCalledWith(2, "user-123/avatar-new.jpg");
  });

  it("does not delete anything after a successful replacement with no previous image", async () => {
    const removeObject = vi.fn(async () => undefined);

    await replaceProfileMedia({
      userId,
      field: "cover_url",
      bucketPublicUrl,
      newPath: "user-123/cover-new.jpg",
      loadProfile: async () => profile(),
      upload: async () => undefined,
      getPublicUrl: () => publicUrl("user-123/cover-new.jpg"),
      compareAndSwapProfile: async () => undefined,
      removeObject,
    });

    expect(removeObject).not.toHaveBeenCalled();
  });

  it("does not overwrite a newer generation or delete its own possibly-current object when rollback loses", async () => {
    const oldUrl = publicUrl("user-123/avatar-old.jpg");
    const newUrl = publicUrl("user-123/avatar-new.jpg");
    const compareAndSwapProfile = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ProfileMediaConflictError());
    const removeObject = vi.fn(async () => {
      throw new Error("storage unavailable");
    });

    await expect(
      replaceProfileMedia({
        userId,
        field: "avatar_url",
        bucketPublicUrl,
        newPath: "user-123/avatar-new.jpg",
        loadProfile: async () => profile(oldUrl),
        upload: async () => undefined,
        getPublicUrl: () => newUrl,
        compareAndSwapProfile,
        removeObject,
      }),
    ).rejects.toBeInstanceOf(ProfileMediaPartialFailureError);

    expect(compareAndSwapProfile).toHaveBeenNthCalledWith(2, "avatar_url", newUrl, oldUrl);
    expect(removeObject).toHaveBeenCalledTimes(1);
    expect(removeObject).toHaveBeenCalledWith("user-123/avatar-old.jpg");
  });

  it("serializes two replacements without stale overwrite or deleting the winning generation", async () => {
    const oldPath = "user-123/avatar-old.jpg";
    const firstPath = "user-123/avatar-first.jpg";
    const secondPath = "user-123/avatar-second.jpg";
    const { store, compareAndSwapProfile, removeObject } = createMediaStore(publicUrl(oldPath), [
      oldPath,
    ]);
    const loadProfile = createConcurrentLoadProfile(() => store.currentUrl);
    const replace = (path: string) =>
      replaceProfileMedia({
        userId,
        field: "avatar_url",
        bucketPublicUrl,
        newPath: path,
        loadProfile,
        upload: async () => {
          store.objects.add(path);
        },
        getPublicUrl: () => publicUrl(path),
        compareAndSwapProfile,
        removeObject,
      });

    const results = await Promise.allSettled([replace(firstPath), replace(secondPath)]);
    const winningPath = store.currentUrl === publicUrl(firstPath) ? firstPath : secondPath;

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(store.objects).toEqual(new Set([winningPath]));
    expect(store.deletedWhileCurrent).toEqual([]);
  });
});

describe("removeProfileMedia", () => {
  it("sets the field to null and removes the previous owned object", async () => {
    const oldUrl = publicUrl("user-123/cover-old.jpg");
    const compareAndSwapProfile = vi.fn(async () => undefined);
    const removeObject = vi.fn(async () => undefined);

    await removeProfileMedia({
      userId,
      field: "cover_url",
      bucketPublicUrl,
      loadProfile: async () => profile(null, oldUrl),
      compareAndSwapProfile,
      removeObject,
    });

    expect(compareAndSwapProfile).toHaveBeenCalledWith("cover_url", oldUrl, null);
    expect(removeObject).toHaveBeenCalledWith("user-123/cover-old.jpg");
  });

  it("restores the previous URL when storage deletion fails", async () => {
    const oldUrl = publicUrl("user-123/avatar-old.jpg");
    const compareAndSwapProfile = vi.fn(async () => undefined);

    await expect(
      removeProfileMedia({
        userId,
        field: "avatar_url",
        bucketPublicUrl,
        loadProfile: async () => profile(oldUrl),
        compareAndSwapProfile,
        removeObject: async () => {
          throw new Error("storage unavailable");
        },
      }),
    ).rejects.toBeInstanceOf(ProfileMediaPartialFailureError);

    expect(compareAndSwapProfile).toHaveBeenNthCalledWith(1, "avatar_url", oldUrl, null);
    expect(compareAndSwapProfile).toHaveBeenNthCalledWith(2, "avatar_url", null, oldUrl);
  });

  it("does not delete external previous URLs", async () => {
    const removeObject = vi.fn(async () => undefined);

    await removeProfileMedia({
      userId,
      field: "avatar_url",
      bucketPublicUrl,
      loadProfile: async () => profile("https://images.example.com/avatar.jpg"),
      compareAndSwapProfile: async () => undefined,
      removeObject,
    });

    expect(removeObject).not.toHaveBeenCalled();
  });

  it.each([
    "replacement-first",
    "removal-first",
  ] as const)("keeps replacement-vs-removal safe when %s wins the CAS race", async (order) => {
    const oldPath = "user-123/avatar-old.jpg";
    const newPath = "user-123/avatar-new.jpg";
    const { store, compareAndSwapProfile, removeObject } = createMediaStore(publicUrl(oldPath), [
      oldPath,
    ]);
    const loadProfile = createConcurrentLoadProfile(() => store.currentUrl);
    const replacement = () =>
      replaceProfileMedia({
        userId,
        field: "avatar_url",
        bucketPublicUrl,
        newPath,
        loadProfile,
        upload: async () => {
          store.objects.add(newPath);
        },
        getPublicUrl: () => publicUrl(newPath),
        compareAndSwapProfile,
        removeObject,
      });
    const removal = () =>
      removeProfileMedia({
        userId,
        field: "avatar_url",
        bucketPublicUrl,
        loadProfile,
        compareAndSwapProfile,
        removeObject,
      });

    const operations =
      order === "replacement-first" ? [replacement(), removal()] : [removal(), replacement()];
    const results = await Promise.allSettled(operations);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(store.deletedWhileCurrent).toEqual([]);
    expect(store.objects).toEqual(store.currentUrl === null ? new Set() : new Set([newPath]));
  });
});
