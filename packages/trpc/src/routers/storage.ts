import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../index";

// Storage-specific schemas (not database tables)
const createSignedUploadUrlSchema = z.object({
  fileName: z.string().min(1),
  fileType: z.string().min(1),
});

const getSignedUrlSchema = z.object({
  filePath: z.string().min(1),
});

const deleteFileSchema = z.object({
  filePath: z.string().min(1),
});

export const storageRouter = createTRPCRouter({
  createSignedUploadUrl: protectedProcedure
    .input(createSignedUploadUrlSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // Create a unique file path using the user's ID
        const timestamp = Date.now();
        const cleanFileName = input.fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
        const filePath = `profile-avatars/${ctx.user.id}/${timestamp}-${cleanFileName}`;

        const { data, error } = await ctx.supabase.storage
          .from("avatars") // Assuming 'avatars' bucket exists
          .createSignedUploadUrl(filePath);

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        return {
          signedUrl: data.signedUrl,
          path: filePath,
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
    .input(getSignedUrlSchema)
    .query(async ({ ctx, input }) => {
      try {
        // Security check: verify the file path belongs to the authenticated user
        if (!input.filePath.startsWith(`profile-avatars/${ctx.user.id}/`)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Access denied: file does not belong to user",
          });
        }

        const { data, error } = await ctx.supabase.storage
          .from("avatars")
          .createSignedUrl(input.filePath, 60); // 60 seconds expiration

        if (error) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
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
    .input(deleteFileSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // Security check: verify the file path belongs to the authenticated user
        if (!input.filePath.startsWith(`profile-avatars/${ctx.user.id}/`)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Access denied: file does not belong to user",
          });
        }

        const { error } = await ctx.supabase.storage
          .from("avatars")
          .remove([input.filePath]);

        if (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
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
