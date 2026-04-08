import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getApiStorageService } from "../storage-service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const storageService = getApiStorageService();

const BUCKET_NAME = "profile-avatars";
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"] as const;
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
  .refine((value) => !value.split("/").some((segment) => segment.length === 0 || segment === "." || segment === ".."), {
    message: "File path contains invalid path segments",
  });

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

function getFileExtension(fileName: string) {
  return fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
}

function assertOwnedFilePath(userId: string, filePath: string) {
  if (!filePath.startsWith(`${userId}/`)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You can only access your own files",
    });
  }
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
      try {
        const fileExt = getFileExtension(input.fileName);
        const uniqueFileName = `${ctx.session.user.id}/${Date.now()}.${fileExt}`;

        const { data, error } = await storageService.storage
          .from(BUCKET_NAME)
          .createSignedUploadUrl(uniqueFileName);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to create signed upload URL: ${error.message}`,
          });
        }

        const signedUploadData = signedUploadUrlDataSchema.parse(data);
        assertOwnedFilePath(ctx.session.user.id, signedUploadData.path);

        const {
          data: publicUrlData,
        } = storageService.storage.from(BUCKET_NAME).getPublicUrl(signedUploadData.path);
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
      try {
        assertOwnedFilePath(ctx.session.user.id, input.filePath);

        const { data, error } = await storageService.storage
          .from(BUCKET_NAME)
          .createSignedUrl(input.filePath, 3600);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to create signed URL: ${error.message}`,
          });
        }

        const signedUrlData = signedUrlDataSchema.parse(data);

        return {
          signedUrl: signedUrlData.signedUrl,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get signed URL",
        });
      }
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
        assertOwnedFilePath(ctx.session.user.id, input.filePath);

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
