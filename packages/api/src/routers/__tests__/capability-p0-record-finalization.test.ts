import { describe, expect, it } from "vitest";
import { activityFilesRouter } from "../activity-files";

describe("record finalized API boundary", () => {
  it("keeps finalized submission retries on the idempotent upload boundary", () => {
    expect(activityFilesRouter._def.procedures).toHaveProperty("beginMobileRecordingUpload");
    expect(activityFilesRouter._def.procedures).not.toHaveProperty("retryIngestion");
  });
});
