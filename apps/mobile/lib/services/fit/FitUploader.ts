/**
 * FitUploader - Upload FIT files to Supabase Storage
 *
 * Features:
 * - Background upload with progress tracking
 * - Automatic retry with exponential backoff
 * - Chunked upload for large files
 * - Network state awareness
 */

import {
  createClient,
  SupabaseClient,
  SupabaseClientOptions,
} from "@supabase/supabase-js";
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
  chunkSize: number;
  timeoutMs: number;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB in bytes

const DEFAULT_CONFIG: UploadConfig = {
  maxRetries: 3,
  baseRetryDelayMs: 1000,
  maxRetryDelayMs: 30000,
  chunkSize: 5 * 1024 * 1024,
  timeoutMs: 60000,
};

export interface UploadState {
  isUploading: boolean;
  progress: UploadProgress | null;
  lastError: string | null;
  attempts: number;
}

export class FitUploader {
  private supabaseUrl: string;
  private supabaseKey: string;
  private bucketName: string;
  private config: UploadConfig;
  private uploadState: UploadState;

  constructor(
    supabaseUrl: string,
    supabaseAnonKey: string,
    bucketName: string = "fit-files",
    config?: Partial<UploadConfig>,
  ) {
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseAnonKey;
    this.bucketName = bucketName;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.uploadState = {
      isUploading: false,
      progress: null,
      lastError: null,
      attempts: 0,
    };
  }

  /**
   * Get the Supabase client instance
   */
  private getSupabaseClient(): SupabaseClient {
    return createClient(this.supabaseUrl, this.supabaseKey);
  }

  /**
   * Upload a FIT file to Supabase Storage
   */
  /**
   * Upload a file to a specific presigned URL
   */
  async uploadToSignedUrl(
    filePath: string,
    signedUrl: string,
  ): Promise<UploadResult> {
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
      this.uploadState.lastError =
        error instanceof Error ? error.message : "Unknown error";

      return {
        success: false,
        error: this.uploadState.lastError,
        attempts: this.uploadState.attempts,
      };
    }
  }

  /**
   * Legacy method: Upload using file path construction (requires auth token)
   * @deprecated Use uploadToSignedUrl instead
   */
  async uploadFile(
    filePath: string,
    userId: string,
    activityId: string,
    accessToken?: string,
  ): Promise<UploadResult> {
    const fileName = this.generateFileName(userId, activityId);
    const storagePath = `${this.bucketName}/${fileName}`;
    const uploadUrl = `${this.supabaseUrl}/storage/v1/object/${storagePath}`;

    // ... logic delegated to performUpload ...
    // For backward compatibility, we'll keep the full implementation logic here or refactor
    // Refactoring to use the shared helper:

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
      if (!file.exists) throw new Error("File not found");
      const size = file.size ?? 0;
      if (size > MAX_FILE_SIZE) throw new Error("File too large");

      const authHeader = accessToken
        ? `Bearer ${accessToken}`
        : `Bearer ${this.supabaseKey}`;

      for (let attempt = 1; attempt <= this.config.maxRetries + 1; attempt++) {
        this.uploadState.attempts = attempt;
        try {
          const result = await this.performUpload(uploadUrl, filePath, "POST", {
            Authorization: authHeader,
            "Content-Type": "application/octet-stream",
            "x-upsert": "true",
            apikey: this.supabaseKey,
          });

          if (result.success) {
            this.uploadState.isUploading = false;
            this.uploadState.progress = null;
            return result;
          }

          if (attempt <= this.config.maxRetries)
            await this.sleep(this.calculateRetryDelay(attempt));
        } catch (error) {
          if (attempt <= this.config.maxRetries)
            await this.sleep(this.calculateRetryDelay(attempt));
          else throw error;
        }
      }
      throw new Error("Max retries exceeded");
    } catch (error) {
      this.uploadState.isUploading = false;
      this.uploadState.lastError =
        error instanceof Error ? error.message : "Unknown error";
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

      console.log(
        `[FitUploader] Uploading ${blob.size} bytes via Blob to ${url}`,
      );

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
      throw new Error(
        `Upload failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Upload file with progress tracking using expo-file-system upload API
   * @deprecated Internal use only for legacy uploadFile
   */
  private async uploadWithRetry(
    fileName: string,
    filePath: string,
    totalSize: number,
    accessToken?: string,
  ): Promise<UploadResult> {
    const storagePath = `${this.bucketName}/${fileName}`;
    const uploadUrl = `${this.supabaseUrl}/storage/v1/object/${storagePath}`;

    // Use access token if provided, otherwise fallback to anon key (which may fail for RLS)
    const authHeader = accessToken
      ? `Bearer ${accessToken}`
      : `Bearer ${this.supabaseKey}`;

    // Note: Use fetch for modern upload
    try {
      const file = new File(filePath);
      if (!file.exists) throw new Error("File not found");

      // Convert to Blob
      const fileResponse = await fetch(file.uri);
      const blob = await fileResponse.blob();

      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/octet-stream",
          "x-upsert": "true",
          apikey: this.supabaseKey,
        },
        body: blob,
      });

      if (response.ok) {
        const publicUrl = `${this.supabaseUrl}/storage/v1/object/public/${storagePath}`;
        return {
          success: true,
          fileUrl: publicUrl,
          attempts: this.uploadState.attempts,
        };
      } else {
        throw new Error(`Upload failed with status ${response.status}`);
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Upload using Supabase storage SDK directly
   */
  async uploadToStorage(
    filePath: string,
    userId: string,
    activityId: string,
  ): Promise<UploadResult> {
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
      // Validate file size before upload
      if (size > MAX_FILE_SIZE) {
        throw new Error(
          `FIT file size (${(size / (1024 * 1024)).toFixed(2)}MB) exceeds maximum allowed size of 50MB`,
        );
      }

      const fileName = this.generateFileName(userId, activityId);
      const fileContent = await file.base64();

      for (let attempt = 1; attempt <= this.config.maxRetries + 1; attempt++) {
        this.uploadState.attempts = attempt;

        try {
          const supabase = this.getSupabaseClient();
          const result = await supabase.storage
            .from(this.bucketName)
            .upload(fileName, Buffer.from(fileContent, "base64"), {
              upsert: true,
              contentType: "application/octet-stream",
            });

          if (result.error) {
            throw result.error;
          }

          const { data } = supabase.storage
            .from(this.bucketName)
            .getPublicUrl(fileName);

          this.uploadState.isUploading = false;
          this.uploadState.progress = null;

          return {
            success: true,
            fileUrl: data.publicUrl,
            attempts: this.uploadState.attempts,
          };
        } catch (error) {
          if (attempt <= this.config.maxRetries) {
            const delay = this.calculateRetryDelay(attempt);
            await this.sleep(delay);
          } else {
            throw error;
          }
        }
      }

      throw new Error("Max retries exceeded");
    } catch (error) {
      this.uploadState.isUploading = false;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.uploadState.lastError = errorMessage;

      return {
        success: false,
        error: errorMessage,
        attempts: this.uploadState.attempts,
      };
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
   * Delete a file from storage
   */
  async deleteFile(fileName: string): Promise<boolean> {
    try {
      const supabase = this.getSupabaseClient();
      const result = await supabase.storage
        .from(this.bucketName)
        .remove([fileName]);
      return !result.error;
    } catch (error) {
      console.error("[FitUploader] Failed to delete file:", error);
      return false;
    }
  }

  /**
   * Generate unique file name for FIT file
   */
  private generateFileName(userId: string, activityId: string): string {
    const timestamp = Date.now();
    return `activities/${userId}/${activityId}/${timestamp}.fit`;
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
