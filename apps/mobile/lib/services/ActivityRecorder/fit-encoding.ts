/**
 * FIT Encoding Integration for ActivityRecorder
 *
 * This module provides streaming FIT file encoding integration with LiveMetricsManager
 * replacing the legacy StreamBuffer with real-time FIT encoding.
 */

export { StreamingFitEncoder } from "./StreamingFitEncoder";
export type {
  FitRecord,
  FitSessionData,
  FitLapData,
  EncoderConfig,
} from "./StreamingFitEncoder";

export { FitUploader } from "./FitUploader";
export type {
  UploadProgress,
  UploadResult,
  UploadConfig,
  UploadState,
} from "./FitUploader";
