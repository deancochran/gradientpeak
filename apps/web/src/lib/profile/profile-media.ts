type ProfileMediaProfile = Record<"avatar_url" | "cover_url", string | null>;

type ProfileMediaOperations = {
  loadProfile: () => Promise<ProfileMediaProfile>;
  compareAndSwapProfile: (
    field: "avatar_url" | "cover_url",
    expected: string | null,
    next: string | null,
  ) => Promise<void>;
  removeObject: (path: string) => Promise<void>;
};

type ReplaceProfileMediaOptions = ProfileMediaOperations & {
  userId: string;
  field: "avatar_url" | "cover_url";
  bucketPublicUrl: string;
  newPath: string;
  upload: () => Promise<void>;
  getPublicUrl: () => string;
};

type RemoveProfileMediaOptions = ProfileMediaOperations & {
  userId: string;
  field: "avatar_url" | "cover_url";
  bucketPublicUrl: string;
};

export class ProfileMediaPartialFailureError extends Error {
  constructor() {
    super("Profile image change could not be completed safely. Please try again.");
    this.name = "ProfileMediaPartialFailureError";
  }
}

export class ProfileMediaConflictError extends Error {
  constructor() {
    super("Profile image changed. Please retry.");
    this.name = "ProfileMediaConflictError";
  }
}

export function extractOwnedProfileMediaPath({
  publicUrl,
  bucketPublicUrl,
  userId,
  field,
}: {
  publicUrl: string | null;
  bucketPublicUrl: string;
  userId: string;
  field: "avatar_url" | "cover_url";
}): string | null {
  if (!publicUrl) {
    return null;
  }

  try {
    const candidate = new URL(publicUrl);
    const bucket = new URL(bucketPublicUrl);
    const bucketPathPrefix = bucket.pathname.endsWith("/")
      ? bucket.pathname
      : `${bucket.pathname}/`;

    if (
      candidate.origin !== bucket.origin ||
      candidate.username !== "" ||
      candidate.password !== "" ||
      candidate.search !== "" ||
      candidate.hash !== "" ||
      !candidate.pathname.startsWith(bucketPathPrefix)
    ) {
      return null;
    }

    const encodedPath = candidate.pathname.slice(bucketPathPrefix.length);
    const path = decodeURIComponent(encodedPath);
    const imagePrefix = field === "avatar_url" ? "avatar-" : "cover-";
    const ownedPrefix = `${userId}/${imagePrefix}`;
    const fileName = path.slice(ownedPrefix.length);

    if (
      !path.startsWith(ownedPrefix) ||
      fileName.length === 0 ||
      fileName.includes("/") ||
      fileName.includes("\\") ||
      fileName.includes("%")
    ) {
      return null;
    }

    return path;
  } catch {
    return null;
  }
}

async function removeObjectWithoutMaskingError(
  removeObject: (path: string) => Promise<void>,
  path: string,
) {
  try {
    await removeObject(path);
  } catch {
    // The caller must retain the primary upload, URL-validation, or persistence error.
  }
}

export async function replaceProfileMedia(options: ReplaceProfileMediaOptions): Promise<void> {
  const previousProfile = await options.loadProfile();
  const previousUrl = previousProfile[options.field];

  await options.upload();

  let newPublicUrl: string;
  try {
    newPublicUrl = options.getPublicUrl();
    const ownedNewPath = extractOwnedProfileMediaPath({
      publicUrl: newPublicUrl,
      bucketPublicUrl: options.bucketPublicUrl,
      userId: options.userId,
      field: options.field,
    });

    if (ownedNewPath !== options.newPath) {
      throw new Error("Profile image URL validation failed");
    }

    await options.compareAndSwapProfile(options.field, previousUrl, newPublicUrl);
  } catch (error) {
    await removeObjectWithoutMaskingError(options.removeObject, options.newPath);
    throw error;
  }

  const previousPath = extractOwnedProfileMediaPath({
    publicUrl: previousUrl,
    bucketPublicUrl: options.bucketPublicUrl,
    userId: options.userId,
    field: options.field,
  });

  if (!previousPath || previousPath === options.newPath) {
    return;
  }

  try {
    await options.removeObject(previousPath);
  } catch {
    let restoredPreviousUrl = false;
    try {
      await options.compareAndSwapProfile(options.field, newPublicUrl, previousUrl);
      restoredPreviousUrl = true;
    } catch {
      // Keep the new object because the profile may still reference it.
    }

    if (restoredPreviousUrl) {
      await removeObjectWithoutMaskingError(options.removeObject, options.newPath);
    }

    throw new ProfileMediaPartialFailureError();
  }
}

export async function removeProfileMedia(options: RemoveProfileMediaOptions): Promise<void> {
  const previousProfile = await options.loadProfile();
  const previousUrl = previousProfile[options.field];

  await options.compareAndSwapProfile(options.field, previousUrl, null);

  const previousPath = extractOwnedProfileMediaPath({
    publicUrl: previousUrl,
    bucketPublicUrl: options.bucketPublicUrl,
    userId: options.userId,
    field: options.field,
  });

  if (!previousPath) {
    return;
  }

  try {
    await options.removeObject(previousPath);
  } catch {
    try {
      await options.compareAndSwapProfile(options.field, null, previousUrl);
    } catch {
      // A sanitized partial-failure error is surfaced either way.
    }

    throw new ProfileMediaPartialFailureError();
  }
}
