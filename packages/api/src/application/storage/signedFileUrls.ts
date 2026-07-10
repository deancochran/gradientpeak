import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getApiStorageService } from "../../storage-service";

const storageService = getApiStorageService();

const BUCKET_NAME = "profile-avatars";
const BUCKET_FILE_SIZE_LIMIT = "5MB";
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

const filePathSchema = z
  .string()
  .trim()
  .min(1, "File path is required")
  .max(1024, "File path is too long")
  .refine((value) => !value.startsWith("/") && !value.endsWith("/"), {
    message: "File path must be relative to the bucket root",
  })
  .refine((value) => !value.includes("\\"), {
    message: "File path must not include backslashes",
  })
  .refine(
    (value) =>
      !value
        .split("/")
        .some((segment) => segment.length === 0 || segment === "." || segment === ".."),
    {
      message: "File path contains invalid path segments",
    },
  );

const signedUploadUrlDataSchema = z.object({
  signedUrl: z.string().min(1),
  path: filePathSchema,
});

const publicUrlDataSchema = z.object({
  publicUrl: z.string().url(),
});

const signedUrlDataSchema = z.object({
  signedUrl: z.string().min(1),
});

export function assertOwnedStoragePath(userId: string, filePath: string) {
  if (!filePath.startsWith(`${userId}/`)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You can only access your own files",
    });
  }
}

async function ensureAvatarBucketExists() {
  const { error } = await storageService.storage.createBucket(BUCKET_NAME, {
    public: true,
    fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
    allowedMimeTypes: [...ALLOWED_MIME_TYPES],
  });

  if (error && !error.message.toLowerCase().includes("already exists")) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to ensure avatar bucket: ${error.message}`,
    });
  }
}

export async function createSignedAvatarUploadUrl({
  userId,
  fileExtension,
}: {
  userId: string;
  fileExtension: string;
}) {
  try {
    await ensureAvatarBucketExists();

    const filePath = `${userId}/${Date.now()}.${fileExtension}`;
    const { data, error } = await storageService.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(filePath);

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to create signed upload URL: ${error.message}`,
      });
    }

    const signedUploadData = signedUploadUrlDataSchema.parse(data);
    assertOwnedStoragePath(userId, signedUploadData.path);

    const { data: publicUrlData } = storageService.storage
      .from(BUCKET_NAME)
      .getPublicUrl(signedUploadData.path);
    const { publicUrl } = publicUrlDataSchema.parse(publicUrlData);

    return {
      signedUrl: signedUploadData.signedUrl,
      path: signedUploadData.path,
      publicUrl,
    };
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create signed upload URL",
    });
  }
}

export async function createSignedAvatarDownloadUrl({
  userId,
  filePath,
}: {
  userId: string;
  filePath: string;
}) {
  try {
    await ensureAvatarBucketExists();
    assertOwnedStoragePath(userId, filePath);

    const { data, error } = await storageService.storage
      .from(BUCKET_NAME)
      .createSignedUrl(filePath, 3600);

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to create signed URL: ${error.message}`,
      });
    }

    const signedUrlData = signedUrlDataSchema.parse(data);

    return { signedUrl: signedUrlData.signedUrl };
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to get signed URL",
    });
  }
}
