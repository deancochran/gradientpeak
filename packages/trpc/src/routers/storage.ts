import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const BUCKET_NAME = "profile-avatars";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
];

export const storageRouter = createTRPCRouter({
  createSignedUploadUrl: protectedProcedure
    .input(
      z.object({
        fileName: z.string(),
        fileType: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Validate file type
        if (!ALLOWED_MIME_TYPES.includes(input.fileType)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `File type ${input.fileType} is not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}`,
          });
        }

        // Generate unique file path
        const fileExt = input.fileName.split(".").pop() || "jpg";
        const uniqueFileName = `${ctx.session.user.id}/${Date.now()}.${fileExt}`;

        // Create signed upload URL
        const { data, error } = await ctx.supabase.storage
          .from(BUCKET_NAME)
          .createSignedUploadUrl(uniqueFileName);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to create signed upload URL: ${error.message}`,
          });
        }

        return {
          signedUrl: data.signedUrl,
          path: data.path,
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
      z.object({
        filePath: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        if (!input.filePath) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "File path is required",
          });
        }

        // Create signed URL for download (valid for 1 hour)
        const { data, error } = await ctx.supabase.storage
          .from(BUCKET_NAME)
          .createSignedUrl(input.filePath, 3600);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to create signed URL: ${error.message}`,
          });
        }

        return {
          signedUrl: data.signedUrl,
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
      z.object({
        filePath: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Ensure user can only delete their own files
        if (!input.filePath.startsWith(ctx.session.user.id)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only delete your own files",
          });
        }

        const { error } = await ctx.supabase.storage
          .from(BUCKET_NAME)
          .remove([input.filePath]);

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
