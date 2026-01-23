/**
 * FIT File Operations Router
 *
 * Handles FIT file upload, processing, and management operations.
 * Integrates with the analyze-fit-file edge function.
 */

import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import type { Context } from "../context";

const FIT_FILE_SIZE_LIMIT = 50 * 1024 * 1024; // 50MB
const FIT_FILE_TYPES = [".fit"];

const uploadFitFileInput = z.object({
  fileName: z.string().min(1, "File name is required"),
  fileSize: z
    .number()
    .max(
      FIT_FILE_SIZE_LIMIT,
      `File size must be less than ${FIT_FILE_SIZE_LIMIT / (1024 * 1024)}MB`,
    ),
  fileType: z
    .string()
    .refine(
      (type) => FIT_FILE_TYPES.some((ext) => type.toLowerCase().endsWith(ext)),
      {
        message: `File type must be one of: ${FIT_FILE_TYPES.join(", ")}`,
      },
    ),
  fileData: z.string(), // Base64 encoded file data
});

const analyzeFitFileInput = z.object({
  activityId: z.string().uuid(),
  filePath: z.string().min(1, "File path is required"),
  bucketName: z.string().default("fit-files"),
});

export const fitFilesRouter = createTRPCRouter({
  processFitFile: protectedProcedure
    .input(z.object({ filePath: z.string() }))
    .mutation(async () => {
      // Placeholder implementation for Phase 3
      return { success: true };
    }),

  /**
   * Upload a FIT file to Supabase Storage
   */
  uploadFitFile: protectedProcedure
    .input(uploadFitFileInput)
    .mutation(async ({ ctx, input }) => {
      const { fileName, fileSize, fileType, fileData } = input;
      const userId = ctx.session?.user?.id;
      const supabase = ctx.supabase;

      if (!userId) {
        throw new Error("User not authenticated");
      }

      try {
        // Validate file type again (double security)
        if (!fileName.toLowerCase().endsWith(".fit")) {
          throw new Error("Only .fit files are supported");
        }

        // Convert base64 to buffer
        const binaryString = atob(fileData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Create unique file path
        const filePath = `${userId}/${Date.now()}-${fileName}`;

        // Upload to storage
        const { data, error } = await supabase.storage
          .from("fit-files")
          .upload(filePath, bytes, {
            contentType: "application/octet-stream",
            upsert: false,
          });

        if (error) {
          throw new Error(`Failed to upload FIT file: ${error.message}`);
        }

        return {
          success: true,
          filePath,
          size: fileSize,
        };
      } catch (error) {
        console.error("FIT file upload error:", error);
        throw new Error(`FIT file upload failed: ${(error as Error).message}`);
      }
    }),

  /**
   * Trigger FIT file analysis via edge function
   */
  analyzeFitFile: protectedProcedure
    .input(analyzeFitFileInput)
    .mutation(async ({ ctx, input }) => {
      const { activityId, filePath, bucketName } = input;
      const userId = ctx.session?.user?.id;
      const supabase = ctx.supabase;

      if (!userId) {
        throw new Error("User not authenticated");
      }

      try {
        // Note: This assumes the activities table has been migrated to include FIT file columns
        // For now, we'll just call the edge function and return the result
        const { data, error } = await supabase.functions.invoke(
          "analyze-fit-file",
          {
            body: {
              activityId,
              filePath,
              bucketName,
            },
          },
        );

        if (error) {
          throw new Error(`Edge function error: ${error.message}`);
        }

        return data;
      } catch (error) {
        console.error("FIT file analysis error:", error);
        throw new Error(
          `FIT file analysis failed: ${(error as Error).message}`,
        );
      }
    }),

  /**
   * Get FIT file processing status
   */
  getFitFileStatus: protectedProcedure
    .input(z.object({ activityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { activityId } = input;
      const userId = ctx.session?.user?.id;
      const supabase = ctx.supabase;

      if (!userId) {
        throw new Error("User not authenticated");
      }

      // Note: This will work once the migration is applied
      // For now, return a placeholder response
      try {
        const { data, error } = await supabase
          .from("activities")
          .select("id, name, type, started_at")
          .eq("id", activityId)
          .eq("profile_id", userId)
          .single();

        if (error) {
          throw new Error(`Failed to get activity: ${error.message}`);
        }

        return {
          processingStatus: "pending", // Placeholder
          filePath: null, // Placeholder
          fileSize: null, // Placeholder
          version: null, // Placeholder
          updatedAt: null, // Placeholder
          activity: data, // Basic activity info
        };
      } catch (error) {
        console.error("FIT file status error:", error);
        throw new Error(
          `Failed to get FIT file status: ${(error as Error).message}`,
        );
      }
    }),

  /**
   * List FIT files for a user
   */
  listFitFiles: protectedProcedure
    .input(
      z.object({
        pageSize: z.number().min(1).max(100).default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { pageSize, cursor } = input;
      const userId = ctx.session?.user?.id;
      const supabase = ctx.supabase;

      if (!userId) {
        throw new Error("User not authenticated");
      }

      try {
        let query = supabase
          .from("activities")
          .select(
            `
            id,
            name,
            type,
            started_at,
            created_at
          `,
          )
          .eq("profile_id", userId)
          .order("created_at", { ascending: false })
          .limit(pageSize);

        if (cursor) {
          query = query.gt("created_at", cursor);
        }

        const { data, error } = await query;

        if (error) {
          throw new Error(`Failed to list activities: ${error.message}`);
        }

        return {
          files: data || [],
          nextCursor:
            data?.length === pageSize
              ? data[data.length - 1]?.created_at
              : null,
        };
      } catch (error) {
        console.error("List FIT files error:", error);
        throw new Error(
          `Failed to list FIT files: ${(error as Error).message}`,
        );
      }
    }),

  /**
   * Get FIT file download URL (presigned)
   */
  getFitFileUrl: protectedProcedure
    .input(
      z.object({
        filePath: z.string().min(1, "File path is required"),
        expiresIn: z.number().min(60).max(3600).default(3600), // 1 hour default
      }),
    )
    .query(async ({ ctx, input }) => {
      const { filePath, expiresIn } = input;
      const userId = ctx.session?.user?.id;
      const supabase = ctx.supabase;

      if (!userId) {
        throw new Error("User not authenticated");
      }

      try {
        // Verify user owns this file (check file path starts with user ID)
        if (!filePath.startsWith(`${userId}/`)) {
          throw new Error("Access denied: You can only access your own files");
        }

        // Generate signed URL
        const { data, error } = await supabase.storage
          .from("fit-files")
          .createSignedUrl(filePath, expiresIn);

        if (error) {
          throw new Error(`Failed to generate download URL: ${error.message}`);
        }

        return {
          signedUrl: (data as any)?.signedUrl,
          expiresAt: (data as any)?.expiresAt,
        };
      } catch (error) {
        console.error("Get FIT file URL error:", error);
        throw new Error(
          `Failed to generate download URL: ${(error as Error).message}`,
        );
      }
    }),

  /**
   * Delete a FIT file from storage
   */
  deleteFitFile: protectedProcedure
    .input(
      z.object({
        filePath: z.string().min(1, "File path is required"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { filePath } = input;
      const userId = ctx.session?.user?.id;
      const supabase = ctx.supabase;

      if (!userId) {
        throw new Error("User not authenticated");
      }

      try {
        // Verify user owns this file
        if (!filePath.startsWith(`${userId}/`)) {
          throw new Error("Access denied: You can only delete your own files");
        }

        // Delete from storage
        const { error } = await supabase.storage
          .from("fit-files")
          .remove([filePath]);

        if (error) {
          throw new Error(`Failed to delete FIT file: ${error.message}`);
        }

        return { success: true };
      } catch (error) {
        console.error("FIT file deletion error:", error);
        throw new Error(
          `FIT file deletion failed: ${(error as Error).message}`,
        );
      }
    }),
});
