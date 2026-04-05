/**
 * FitUploader - Upload FIT files via API-provided signed URLs
 *
 * Features:
 * - Background upload with progress tracking
 * - Automatic retry with exponential backoff
 * - Network state awareness
 */

import { File } from "expo-file-system";

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadResult {
  success: boolean;
  fileUrl?: string;
  error?: string;
  attempts: number;
}

export interface UploadConfig {
  maxRetries: number;
  baseRetryDelayMs: number;
  maxRetryDelayMs: number;
  timeoutMs: number;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB in bytes

const DEFAULT_CONFIG: UploadConfig = {
  maxRetries: 3,
  baseRetryDelayMs: 1000,
  maxRetryDelayMs: 30000,
  timeoutMs: 60000,
};

export interface UploadState {
  isUploading: boolean;
  progress: UploadProgress | null;
  lastError: string | null;
  attempts: number;
}

export class FitUploader {
  private config: UploadConfig;
  private uploadState: UploadState;

  constructor(
    _unusedBaseUrl?: string,
    _unusedAccessKey?: string,
    _bucketName: string = "fit-files",
    config?: Partial<UploadConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.uploadState = {
      isUploading: false,
      progress: null,
      lastError: null,
      attempts: 0,
    };
  }

  /**
   * Upload a file to a specific presigned URL
   */
  async uploadToSignedUrl(filePath: string, signedUrl: string): Promise<UploadResult> {
    if (this.uploadState.isUploading) {
      return {
        success: false,
        error: "Upload already in progress",
        attempts: 0,
      };
    }

    this.uploadState.isUploading = true;
    this.uploadState.lastError = null;
    this.uploadState.attempts = 0;

    try {
      const file = new File(filePath);
      if (!file.exists) {
        throw new Error("File not found");
      }

      const size = file.size ?? 0;
      if (size > MAX_FILE_SIZE) {
        throw new Error(
          `FIT file size (${(size / (1024 * 1024)).toFixed(2)}MB) exceeds maximum allowed size of 50MB`,
        );
      }

      for (let attempt = 1; attempt <= this.config.maxRetries + 1; attempt++) {
        this.uploadState.attempts = attempt;

        try {
          // Use PUT for signed URLs (standard for S3/Supabase signed uploads)
          const result = await this.performUpload(signedUrl, filePath, "PUT", {
            "Content-Type": "application/octet-stream",
            // No Authorization header needed for signed URLs (it's in the query params)
          });

          if (result.success) {
            this.uploadState.isUploading = false;
            this.uploadState.progress = null;
            return result;
          }

          if (attempt <= this.config.maxRetries) {
            const delay = this.calculateRetryDelay(attempt);
            await this.sleep(delay);
          }
        } catch (error) {
          if (attempt <= this.config.maxRetries) {
            const delay = this.calculateRetryDelay(attempt);
            await this.sleep(delay);
          } else {
            throw error;
          }
        }
      }

      throw new Error(this.uploadState.lastError || "Max retries exceeded");
    } catch (error) {
      this.uploadState.isUploading = false;
      this.uploadState.lastError = error instanceof Error ? error.message : "Unknown error";

      return {
        success: false,
        error: this.uploadState.lastError,
        attempts: this.uploadState.attempts,
      };
    }
  }

  /**
   * Shared upload logic using expo-file-system
   */
  private async performUpload(
    url: string,
    filePath: string,
    method: "POST" | "PUT",
    headers: Record<string, string>,
  ): Promise<UploadResult> {
    try {
      const file = new File(filePath);
      if (!file.exists) {
        throw new Error("File not found");
      }

      // Convert to Blob to ensure binary streaming works with fetch
      // Expo fetch can read from local URIs to create a Blob
      const fileResponse = await fetch(file.uri);
      const blob = await fileResponse.blob();

      console.log(`[FitUploader] Uploading ${blob.size} bytes via Blob to ${url}`);

      const response = await fetch(url, {
        method: method,
        headers: headers,
        body: blob,
      });

      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      // Simulate progress complete
      if (this.uploadState.progress) {
        this.uploadState.progress = {
          loaded: blob.size,
          total: blob.size,
          percentage: 100,
        };
      }

      console.log(`[FitUploader] Upload successful`);

      return {
        success: true,
        fileUrl: url, // Caller should know the path they requested
        attempts: this.uploadState.attempts,
      };
    } catch (error) {
      throw new Error(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get current upload state
   */
  getState(): UploadState {
    return { ...this.uploadState };
  }

  /**
   * Cancel current upload
   */
  async cancelUpload(): Promise<void> {
    this.uploadState.isUploading = false;
    this.uploadState.progress = null;
    console.log("[FitUploader] Upload cancelled");
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const delay = this.config.baseRetryDelayMs * Math.pow(2, attempt - 1);
    return Math.min(delay, this.config.maxRetryDelayMs);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
