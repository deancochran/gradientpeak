import { parseActivityFile } from "@repo/core";
import { useCallback, useState } from "react";
import { api } from "@/lib/api";

/**
 * Custom hook to load and parse activity file streams on-demand
 * Used for activity detail view when user needs GPS/charts
 *
 * @returns Object with loading state, error, and loadStreams function
 */
export function useActivityFileStreams() {
  const utils = api.useUtils();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streams, setStreams] = useState<any | null>(null);

  /**
   * Load and parse activity file from Supabase Storage
   * @param activityFilePath - Path to activity file in storage bucket
   */
  const loadStreams = useCallback(
    async (activityFilePath: string) => {
      if (!activityFilePath) {
        setError("No activity file path provided");
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        console.log("[useActivityFileStreams] Downloading activity file:", activityFilePath);

        const { signedUrl } = await utils.client.activityFiles.getActivityFileUrl.query({
          filePath: activityFilePath,
        });

        const activityFileResponse = await fetch(signedUrl);

        if (!activityFileResponse.ok) {
          throw new Error(`Failed to download activity file: ${activityFileResponse.status}`);
        }

        console.log("[useActivityFileStreams] Parsing activity file...");

        const arrayBuffer = await activityFileResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const parseResult = parseActivityFile({ data: buffer, fileName: activityFilePath });

        if (!parseResult.summary && parseResult.records.length === 0) {
          throw new Error("Failed to parse activity file - no session or records found");
        }

        console.log("[useActivityFileStreams] Activity file parsed successfully");
        setStreams(parseResult);
        return parseResult;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error loading streams";
        console.error("[useActivityFileStreams] Error:", errorMessage);
        setError(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [utils.client.activityFiles],
  );

  /**
   * Clear error state (useful for retry)
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    /**
     * Whether activity file is currently being loaded/parsed
     */
    loading,

    /**
     * Error message if loading/parsing failed
     */
    error,

    /**
     * Parsed stream data from activity file (null if not loaded)
     */
    streams,

    /**
     * Load and parse activity file from storage
     */
    loadStreams,

    /**
     * Clear error state
     */
    clearError,
  };
}
