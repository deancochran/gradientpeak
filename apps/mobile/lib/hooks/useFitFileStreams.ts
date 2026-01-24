import { useState, useCallback } from "react";
import { parseFitFileWithSDK } from "@repo/core";
import { supabase } from "@/lib/supabase/client";

/**
 * Custom hook to load and parse FIT file streams on-demand
 * Used for activity detail view when user needs GPS/charts
 *
 * @returns Object with loading state, error, and loadStreams function
 */
export function useFitFileStreams() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streams, setStreams] = useState<any | null>(null);

  /**
   * Load and parse FIT file from Supabase Storage
   * @param fitFilePath - Path to FIT file in storage bucket
   */
  const loadStreams = useCallback(async (fitFilePath: string) => {
    if (!fitFilePath) {
      setError("No FIT file path provided");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      console.log("[useFitFileStreams] Downloading FIT file:", fitFilePath);

      // Download FIT file from storage
      const { data: fitFile, error: downloadError } = await supabase.storage
        .from("fit-files")
        .download(fitFilePath);

      if (downloadError || !fitFile) {
        throw new Error(
          downloadError?.message || "Failed to download FIT file",
        );
      }

      console.log("[useFitFileStreams] Parsing FIT file...");

      // Parse FIT file
      const arrayBuffer = await fitFile.arrayBuffer();
      const parseResult = await parseFitFileWithSDK(arrayBuffer);

      if (!parseResult.session && parseResult.records.length === 0) {
        throw new Error(
          "Failed to parse FIT file - no session or records found",
        );
      }

      console.log("[useFitFileStreams] FIT file parsed successfully");
      setStreams(parseResult);
      return parseResult;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error loading streams";
      console.error("[useFitFileStreams] Error:", errorMessage);
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

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
