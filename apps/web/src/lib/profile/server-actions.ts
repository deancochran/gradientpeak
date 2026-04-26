import { getApiStorageService } from "@repo/api/server";
import { resolveAuthSessionFromHeaders } from "@repo/auth/server";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

import { buildFlashHref } from "../flash";
import { createServerActionCaller } from "../server-action-api";
import { settingsProfileFormSchema } from "./form-schemas";

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

      await caller.profiles.update({
        is_public: data.is_public,
        username: data.username.trim() === "" ? null : data.username.trim(),
      });
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

  const avatar = data.get("avatar");

  if (!(avatar instanceof File)) {
    throw new Error("Avatar file is required");
  }

  return { _native: true as const, avatar };
}

function getAvatarFileExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (!extension) {
    throw new Error("Avatar file must include an extension");
  }

  return extension;
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

    await ensureAvatarBucketExists();

    const fileExtension = getAvatarFileExtension(data.avatar.name);
    const filePath = `${session.user.id}/${Date.now()}.${fileExtension}`;
    const bytes = Buffer.from(await data.avatar.arrayBuffer());
    const { error } = await storageService.storage
      .from(PROFILE_AVATAR_BUCKET)
      .upload(filePath, bytes, {
        contentType: data.avatar.type,
        upsert: false,
      });

    if (error) {
      throw redirect({
        href: buildFlashHref("/settings", `Failed to upload avatar: ${error.message}`, "error"),
        statusCode: 303,
      });
    }

    try {
      const caller = await createServerActionCaller();
      const publicUrlData = storageService.storage
        .from(PROFILE_AVATAR_BUCKET)
        .getPublicUrl(filePath).data;
      const publicUrl = z.object({ publicUrl: z.string().url() }).parse(publicUrlData).publicUrl;

      await caller.profiles.update({
        avatar_url: publicUrl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update avatar";
      throw redirect({ href: buildFlashHref("/settings", message, "error"), statusCode: 303 });
    }

    throw redirect({
      href: "/settings?flash=Avatar%20updated%20successfully&flashType=success",
      statusCode: 303,
    });
  });
