import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  assertOwnedStoragePath,
  createSignedAvatarDownloadUrl,
  createSignedAvatarUploadUrl,
} from "../application/storage/signedFileUrls";
import { getApiStorageService } from "../storage-service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const storageService = getApiStorageService();

const BUCKET_NAME = "profile-avatars";
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
const MIME_TYPE_TO_EXTENSIONS = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/jpg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/gif": ["gif"],
  "image/webp": ["webp"],
} as const;

const fileNameSchema = z
  .string()
  .trim()
  .min(1, "File name is required")
  .max(255, "File name is too long")
  .refine((value) => !value.includes("/") && !value.includes("\\"), {
    message: "File name must not include path separators",
  })
  .refine((value) => !value.includes(".."), {
    message: "File name must not include parent directory traversal",
  })
  .refine((value) => value.includes("."), {
    message: "File name must include an extension",
  });

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

function getFileExtension(fileName: string) {
  return fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
}

export const storageRouter = createTRPCRouter({
  createSignedUploadUrl: protectedProcedure
    .input(
      z
        .object({
          fileName: fileNameSchema,
          fileType: z.enum(ALLOWED_MIME_TYPES),
        })
        .strict()
        .superRefine(({ fileName, fileType }, ctx) => {
          const extension = getFileExtension(fileName);
          const allowedExtensions = MIME_TYPE_TO_EXTENSIONS[fileType];

          if (!allowedExtensions.some((allowedExtension) => allowedExtension === extension)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `File extension .${extension} does not match MIME type ${fileType}`,
              path: ["fileName"],
            });
          }
        }),
    )
    .mutation(async ({ ctx, input }) => {
      return createSignedAvatarUploadUrl({
        userId: ctx.session.user.id,
        fileExtension: getFileExtension(input.fileName),
      });
    }),

  getSignedUrl: protectedProcedure
    .input(
      z
        .object({
          filePath: filePathSchema,
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      return createSignedAvatarDownloadUrl({
        userId: ctx.session.user.id,
        filePath: input.filePath,
      });
    }),

  deleteFile: protectedProcedure
    .input(
      z
        .object({
          filePath: filePathSchema,
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        assertOwnedStoragePath(ctx.session.user.id, input.filePath);

        const { error } = await storageService.storage.from(BUCKET_NAME).remove([input.filePath]);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to delete file: ${error.message}`,
          });
        }

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete file",
        });
      }
    }),
});
