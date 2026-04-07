import { parseFitFileWithSDK } from "@repo/core";
import { useCallback, useState } from "react";
import { api } from "@/lib/api";

/**
 * Custom hook to load and parse FIT file streams on-demand
 * Used for activity detail view when user needs GPS/charts
 *
 * @returns Object with loading state, error, and loadStreams function
 */
export function useFitFileStreams() {
  const utils = api.useUtils();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streams, setStreams] = useState<any | null>(null);

  /**
   * Load and parse FIT file from Supabase Storage
   * @param fitFilePath - Path to FIT file in storage bucket
   */
  const loadStreams = useCallback(
    async (fitFilePath: string) => {
      if (!fitFilePath) {
        setError("No FIT file path provided");
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        console.log("[useFitFileStreams] Downloading FIT file:", fitFilePath);

        const { signedUrl } = await utils.client.fitFiles.getFitFileUrl.query({
          filePath: fitFilePath,
        });

        const fitFileResponse = await fetch(signedUrl);

        if (!fitFileResponse.ok) {
          throw new Error(`Failed to download FIT file: ${fitFileResponse.status}`);
        }

        console.log("[useFitFileStreams] Parsing FIT file...");

        // Parse FIT file
        const arrayBuffer = await fitFileResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const parseResult = parseFitFileWithSDK(buffer);

        if (!parseResult.summary && parseResult.records.length === 0) {
          throw new Error("Failed to parse FIT file - no session or records found");
        }

        console.log("[useFitFileStreams] FIT file parsed successfully");
        setStreams(parseResult);
        return parseResult;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error loading streams";
        console.error("[useFitFileStreams] Error:", errorMessage);
        setError(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [utils.client.fitFiles],
  );

  /**
   * Clear error state (useful for retry)
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    /**
     * Whether FIT file is currently being loaded/parsed
     */
    loading,

    /**
     * Error message if loading/parsing failed
     */
    error,

    /**
     * Parsed stream data from FIT file (null if not loaded)
     */
    streams,

    /**
     * Load and parse FIT file from storage
     */
    loadStreams,

    /**
     * Clear error state
     */
    clearError,
  };
}
