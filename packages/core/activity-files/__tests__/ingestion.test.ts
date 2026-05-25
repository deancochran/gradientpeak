import { describe, expect, it } from "vitest";
import {
  activityFileIngestionSourceSchema,
  activityFileIngestionStatusSchema,
  canTransitionActivityFileIngestionStatus,
} from "../ingestion";

describe("activity file ingestion contracts", () => {
  it("defines supported ingestion statuses", () => {
    expect(activityFileIngestionStatusSchema.options).toEqual([
      "pending_upload",
      "uploaded",
      "processing",
      "ready",
      "failed",
    ]);
  });

  it("defines supported ingestion sources", () => {
    expect(activityFileIngestionSourceSchema.options).toEqual([
      "mobile_recording",
      "manual_import",
      "provider_sync",
    ]);
  });

  it("allows forward ingestion transitions and same-status no-ops", () => {
    expect(canTransitionActivityFileIngestionStatus("pending_upload", "uploaded")).toBe(true);
    expect(canTransitionActivityFileIngestionStatus("pending_upload", "failed")).toBe(true);
    expect(canTransitionActivityFileIngestionStatus("uploaded", "processing")).toBe(true);
    expect(canTransitionActivityFileIngestionStatus("uploaded", "failed")).toBe(true);
    expect(canTransitionActivityFileIngestionStatus("processing", "ready")).toBe(true);
    expect(canTransitionActivityFileIngestionStatus("processing", "failed")).toBe(true);

    for (const status of activityFileIngestionStatusSchema.options) {
      expect(canTransitionActivityFileIngestionStatus(status, status)).toBe(true);
    }
  });

  it("allows practical retry transitions from failed", () => {
    expect(canTransitionActivityFileIngestionStatus("failed", "pending_upload")).toBe(true);
    expect(canTransitionActivityFileIngestionStatus("failed", "uploaded")).toBe(true);
    expect(canTransitionActivityFileIngestionStatus("failed", "processing")).toBe(true);
  });

  it("rejects skipped or regressive transitions", () => {
    expect(canTransitionActivityFileIngestionStatus("pending_upload", "processing")).toBe(false);
    expect(canTransitionActivityFileIngestionStatus("pending_upload", "ready")).toBe(false);
    expect(canTransitionActivityFileIngestionStatus("uploaded", "pending_upload")).toBe(false);
    expect(canTransitionActivityFileIngestionStatus("uploaded", "ready")).toBe(false);
    expect(canTransitionActivityFileIngestionStatus("processing", "uploaded")).toBe(false);
    expect(canTransitionActivityFileIngestionStatus("failed", "ready")).toBe(false);
  });

  it("treats ready as terminal except idempotent ready", () => {
    expect(canTransitionActivityFileIngestionStatus("ready", "ready")).toBe(true);
    expect(canTransitionActivityFileIngestionStatus("ready", "pending_upload")).toBe(false);
    expect(canTransitionActivityFileIngestionStatus("ready", "uploaded")).toBe(false);
    expect(canTransitionActivityFileIngestionStatus("ready", "processing")).toBe(false);
    expect(canTransitionActivityFileIngestionStatus("ready", "failed")).toBe(false);
  });
});
