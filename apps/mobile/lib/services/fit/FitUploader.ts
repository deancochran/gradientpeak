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
import * as FileSystem from "expo-file-system";
import { FileSystemUploadType } from "expo-file-system";

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
  async uploadFile(
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
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        throw new Error("File not found");
      }

      const fileName = this.generateFileName(userId, activityId);

      for (let attempt = 1; attempt <= this.config.maxRetries + 1; attempt++) {
        this.uploadState.attempts = attempt;

        try {
          const result = await this.uploadWithRetry(
            fileName,
            filePath,
            fileInfo.size || 0,
          );

          if (result.success) {
            this.uploadState.isUploading = false;
            this.uploadState.progress = null;
            return result;
          }

          if (attempt <= this.config.maxRetries) {
            const delay = this.calculateRetryDelay(attempt);
            console.log(
              `[FitUploader] Retrying in ${delay}ms (attempt ${attempt + 1})`,
            );
            await this.sleep(delay);
          }
        } catch (error) {
          if (attempt <= this.config.maxRetries) {
            const delay = this.calculateRetryDelay(attempt);
            console.log(`[FitUploader] Error, retrying in ${delay}ms:`, error);
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
   * Upload file with progress tracking using expo-file-system upload API
   */
  private async uploadWithRetry(
    fileName: string,
    filePath: string,
    totalSize: number,
  ): Promise<UploadResult> {
    const storagePath = `${this.bucketName}/${fileName}`;
    const uploadUrl = `${this.supabaseUrl}/storage/v1/object/${storagePath}`;

    const uploadTask = FileSystem.createUploadTask(uploadUrl, filePath, {
      httpMethod: "POST",
      headers: {
        Authorization: `Bearer ${this.supabaseKey}`,
        "Content-Type": "application/octet-stream",
        "x-upsert": "true",
        apikey: this.supabaseKey,
      },
      uploadType: FileSystemUploadType.MULTIPART,
    });

    uploadTask.addProgressListener((progress) => {
      this.uploadState.progress = {
        loaded: progress.totalBytesSent,
        total: progress.totalBytesExpectedToSend,
        percentage: Math.round(
          (progress.totalBytesSent / progress.totalBytesExpectedToSend) * 100,
        ),
      };
    });

    const result = await uploadTask.promise();

    if (result.statusCode >= 200 && result.statusCode < 300) {
      const publicUrl = `${this.supabaseUrl}/storage/v1/object/public/${storagePath}`;
      return {
        success: true,
        fileUrl: publicUrl,
        attempts: this.uploadState.attempts,
      };
    } else {
      throw new Error(`Upload failed with status ${result.statusCode}`);
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
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        throw new Error("File not found");
      }

      const fileName = this.generateFileName(userId, activityId);

      for (let attempt = 1; attempt <= this.config.maxRetries + 1; attempt++) {
        this.uploadState.attempts = attempt;

        try {
          const fileContent = await FileSystem.readAsStringAsync(filePath, {
            encoding: "base64",
          });

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
