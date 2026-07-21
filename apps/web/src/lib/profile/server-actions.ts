import { getApiStorageService } from "@repo/api/server";
import { resolveAuthSessionFromHeaders } from "@repo/auth/server";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

import { buildFlashHref } from "../flash";
import { createServerActionCaller } from "../server-action-api";
import { settingsProfileFormSchema, toProfilePatchInput } from "./form-schemas";
import {
  ProfileMediaConflictError,
  removeProfileMedia,
  replaceProfileMedia,
} from "./profile-media";

const storageService = getApiStorageService();
const PROFILE_AVATAR_BUCKET = "profile-avatars";
const ALLOWED_AVATAR_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
const profileImageFieldSchema = z.enum(["avatar_url", "cover_url"]);

function normalizeSettingsProfileInput(data: unknown) {
  const native = data instanceof FormData;

  if (data instanceof FormData) {
    return {
      ...settingsProfileFormSchema.parse(Object.fromEntries(data.entries())),
      _native: native,
    };
  }

  return {
    ...settingsProfileFormSchema.parse(data),
    _native: native,
  };
}

export const updateSettingsProfileAction = createServerFn({ method: "POST" })
  .inputValidator((data) => normalizeSettingsProfileInput(data))
  .handler(async ({ data }) => {
    try {
      const caller = await createServerActionCaller();

      await caller.profiles.update(toProfilePatchInput(data));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update profile";

      if (data._native) {
        throw redirect({ href: buildFlashHref("/settings", message, "error"), statusCode: 303 });
      }

      throw error;
    }

    throw redirect({
      href: "/settings?flash=Profile%20updated%20successfully&flashType=success",
      statusCode: 303,
    });
  });

async function ensureAvatarBucketExists() {
  const { error } = await storageService.storage.createBucket(PROFILE_AVATAR_BUCKET, {
    public: true,
    fileSizeLimit: "5MB",
    allowedMimeTypes: [...ALLOWED_AVATAR_MIME_TYPES],
  });

  if (error && !error.message.toLowerCase().includes("already exists")) {
    throw new Error(`Failed to ensure avatar bucket: ${error.message}`);
  }
}

function normalizeAvatarUploadInput(data: unknown) {
  if (!(data instanceof FormData)) {
    throw new Error("Expected multipart form data");
  }

  const avatar = data.get("profile_image");
  const field = profileImageFieldSchema.parse(data.get("field"));

  if (!(avatar instanceof File)) {
    throw new Error("Avatar file is required");
  }

  return { _native: true as const, avatar, field };
}

function getAvatarFileExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (!extension) {
    throw new Error("Avatar file must include an extension");
  }

  return extension;
}

function getProfileMediaPublicUrl(path: string) {
  const publicUrlData = storageService.storage.from(PROFILE_AVATAR_BUCKET).getPublicUrl(path).data;
  return z.object({ publicUrl: z.string().url() }).parse(publicUrlData).publicUrl;
}

async function removeProfileMediaObject(path: string) {
  const { error } = await storageService.storage.from(PROFILE_AVATAR_BUCKET).remove([path]);

  if (error) {
    throw new Error("Failed to remove profile image object");
  }
}

async function compareAndSwapProfileMediaField(
  caller: Awaited<ReturnType<typeof createServerActionCaller>>,
  field: "avatar_url" | "cover_url",
  expected: string | null,
  next: string | null,
) {
  try {
    await caller.profiles.compareAndSwapMedia({ field, expected, next });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "CONFLICT") {
      throw new ProfileMediaConflictError();
    }
    throw error;
  }
}

export const uploadProfileAvatarAction = createServerFn({ method: "POST" })
  .inputValidator((data) => normalizeAvatarUploadInput(data))
  .handler(async ({ data }) => {
    const headers = getRequestHeaders();
    const session = await resolveAuthSessionFromHeaders(headers);

    if (!session?.user?.id) {
      throw redirect({
        href: "/auth/login?flash=Please%20sign%20in&flashType=info",
        statusCode: 303,
      });
    }

    if (
      !ALLOWED_AVATAR_MIME_TYPES.includes(
        data.avatar.type as (typeof ALLOWED_AVATAR_MIME_TYPES)[number],
      )
    ) {
      throw redirect({
        href: buildFlashHref("/settings", "Please select an image file", "error"),
        statusCode: 303,
      });
    }

    if (data.avatar.size > MAX_AVATAR_SIZE_BYTES) {
      throw redirect({
        href: buildFlashHref("/settings", "File size must be less than 5MB", "error"),
        statusCode: 303,
      });
    }

    const fileExtension = getAvatarFileExtension(data.avatar.name);
    const filePath = `${session.user.id}/${data.field.replace("_url", "")}-${Date.now()}.${fileExtension}`;
    const bytes = Buffer.from(await data.avatar.arrayBuffer());

    try {
      const caller = await createServerActionCaller();
      await ensureAvatarBucketExists();
      await replaceProfileMedia({
        userId: session.user.id,
        field: data.field,
        bucketPublicUrl: getProfileMediaPublicUrl(""),
        newPath: filePath,
        loadProfile: () => caller.profiles.get(),
        upload: async () => {
          const { error } = await storageService.storage
            .from(PROFILE_AVATAR_BUCKET)
            .upload(filePath, bytes, {
              contentType: data.avatar.type,
              upsert: false,
            });

          if (error) {
            throw new Error("Failed to upload profile image");
          }
        },
        getPublicUrl: () => getProfileMediaPublicUrl(filePath),
        compareAndSwapProfile: (field, expected, next) =>
          compareAndSwapProfileMediaField(caller, field, expected, next),
        removeObject: removeProfileMediaObject,
      });
    } catch (error) {
      throw redirect({
        href: buildFlashHref(
          "/settings",
          error instanceof ProfileMediaConflictError
            ? error.message
            : "Profile image could not be updated. Please try again.",
          "error",
        ),
        statusCode: 303,
      });
    }

    throw redirect({
      href: `/settings?flash=${data.field === "avatar_url" ? "Avatar" : "Cover"}%20updated%20successfully&flashType=success`,
      statusCode: 303,
    });
  });

function normalizeRemoveProfileImageInput(data: unknown) {
  const source = data instanceof FormData ? Object.fromEntries(data.entries()) : data;
  return {
    field: profileImageFieldSchema.parse(z.object({ field: z.unknown() }).parse(source).field),
  };
}

export const removeProfileImageAction = createServerFn({ method: "POST" })
  .inputValidator(normalizeRemoveProfileImageInput)
  .handler(async ({ data }) => {
    try {
      const headers = getRequestHeaders();
      const session = await resolveAuthSessionFromHeaders(headers);

      if (!session?.user?.id) {
        throw new Error("Authentication required");
      }

      const caller = await createServerActionCaller();
      await removeProfileMedia({
        userId: session.user.id,
        field: data.field,
        bucketPublicUrl: getProfileMediaPublicUrl(""),
        loadProfile: () => caller.profiles.get(),
        compareAndSwapProfile: (field, expected, next) =>
          compareAndSwapProfileMediaField(caller, field, expected, next),
        removeObject: removeProfileMediaObject,
      });
    } catch {
      throw redirect({
        href: buildFlashHref(
          "/settings",
          "Profile image could not be removed. Please try again.",
          "error",
        ),
        statusCode: 303,
      });
    }

    throw redirect({
      href: `/settings?flash=${data.field === "avatar_url" ? "Avatar" : "Cover"}%20removed&flashType=success`,
      statusCode: 303,
    });
  });
