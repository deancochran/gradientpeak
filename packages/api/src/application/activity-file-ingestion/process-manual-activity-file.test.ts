import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createIngestion: vi.fn(),
  markUploaded: vi.fn(),
  markProcessing: vi.fn(),
  markFailed: vi.fn(),
  promote: vi.fn(),
  cleanup: vi.fn(),
  analyze: vi.fn(),
  submit: vi.fn(),
}));

vi.mock("./ingestion-state", () => ({
  ActivityFileIngestionClaimLostError: class ActivityFileIngestionClaimLostError extends Error {},
  createActivityFileIngestion: mocks.createIngestion,
  markUploaded: mocks.markUploaded,
  markProcessing: mocks.markProcessing,
  markFailed: mocks.markFailed,
}));
vi.mock("./artifact-storage", () => ({
  promoteActivityArtifact: mocks.promote,
  cleanupActivityArtifactStaging: mocks.cleanup,
}));
vi.mock("./analyze-parsed-activity-file", () => ({ analyzeParsedActivityFile: mocks.analyze }));
vi.mock("../activities/submit-activity", async () => {
  const actual = await vi.importActual<typeof import("../activities/submit-activity")>(
    "../activities/submit-activity",
  );
  return { ...actual, submitActivity: mocks.submit };
});

import { manualImportActivityId } from "../activities/submit-activity";
import { processManualActivityFile } from "./process-manual-activity-file";

const profileId = "11111111-1111-4111-8111-111111111111";
const activity = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", profile_id: profileId };
const digest = "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81";

function ingestion(
  status: "pending_upload" | "failed" | "processing" | "ready" = "pending_upload",
) {
  return {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    activity_id: status === "ready" ? activity.id : null,
    profile_id: profileId,
    status,
    operation_key: `manual_import:${digest}`,
    claim_token: status === "processing" ? "cccccccc-cccc-4ccc-8ccc-cccccccccccc" : null,
  };
}

function dependencies() {
  return {
    storage: { storage: { from: () => ({ download: vi.fn(), upload: vi.fn(), remove: vi.fn() }) } },
    readStoredActivityFile: vi.fn().mockResolvedValue({
      activityFile: { size: 3, type: "application/octet-stream" },
      data: new Uint8Array([1, 2, 3]),
    }),
    decodeActivityFile: vi.fn().mockReturnValue({
      metadata: { type: "cycling", startTime: new Date("2026-01-01T10:00:00Z") },
      summary: { totalTime: 3600, totalDistance: 20_000 },
      records: [],
      laps: [],
    }),
    getProfileDefaultContentVisibility: vi.fn().mockResolvedValue("private"),
    logger: { error: vi.fn() },
  } as any;
}

function db() {
  return {
    query: {
      activities: { findFirst: vi.fn().mockResolvedValue(activity) },
      activityFileIngestions: { findFirst: vi.fn().mockResolvedValue(ingestion("ready")) },
    },
  } as any;
}

function configureSuccess() {
  mocks.promote.mockResolvedValue({
    sha256: digest,
    byteSize: 3,
    bucket: "activity-files",
    path: `artifacts/sha256/${profileId}/${digest}`,
    mediaType: "application/octet-stream",
    format: "fit",
    stagingPath: `activities/${profileId}/uploads/ride.fit`,
  });
  mocks.analyze.mockResolvedValue({
    startedAt: new Date("2026-01-01T10:00:00Z"),
    activityCompletedAt: new Date("2026-01-01T11:00:00Z"),
    detectedLTHR: null,
    effortsToInsert: [],
    geometry: { mapBounds: null, polyline: null },
    summaryValues: {
      elapsed_ms: 3_600_000,
      active_ms: null,
      moving_ms: null,
      timing_coverage: "unavailable",
      distance_meters: 20_000,
      calories: null,
      elevation_gain_meters: null,
      avg_heart_rate: null,
      max_heart_rate: null,
      avg_power: null,
      max_power: null,
      normalized_power: null,
      avg_cadence: null,
      max_cadence: null,
      avg_speed_mps: null,
      max_speed_mps: null,
      normalized_speed_mps: null,
      normalized_graded_speed_mps: null,
      efficiency_factor: null,
      aerobic_decoupling: null,
      avg_temperature: null,
    },
    segmentSet: { version: 1, elapsedMs: 3_600_000, segments: [] },
  });
  mocks.submit.mockResolvedValue({ id: activity.id });
}

describe("processManualActivityFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a nullable ingestion, fences the claim, and commits the deterministic canonical activity", async () => {
    configureSuccess();
    mocks.createIngestion.mockResolvedValue(ingestion());
    mocks.markUploaded.mockResolvedValue({ ...ingestion(), status: "uploaded" });
    mocks.markProcessing.mockResolvedValue(ingestion("processing"));
    const deps = dependencies();

    await expect(
      processManualActivityFile(
        db(),
        {
          profileId,
          activityFilePath: `activities/${profileId}/uploads/ride.fit`,
          name: "Ride",
          fileType: "fit",
        },
        deps,
      ),
    ).resolves.toMatchObject({ activity });

    expect(mocks.createIngestion).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.any(Object) }),
      expect.objectContaining({ activityId: null, operationKey: `manual_import:${digest}` }),
    );
    expect(mocks.submit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        requestedActivityId: manualImportActivityId(profileId, digest),
        analysis: expect.objectContaining({
          ingestion: expect.objectContaining({ claimToken: ingestion("processing").claim_token }),
        }),
      }),
    );
    expect(mocks.cleanup).toHaveBeenCalledOnce();
  });

  it("replays a ready ingestion without parsing or creating another activity", async () => {
    mocks.createIngestion.mockResolvedValue(ingestion("ready"));
    const deps = dependencies();
    await processManualActivityFile(
      db(),
      {
        profileId,
        activityFilePath: `activities/${profileId}/uploads/ride.fit`,
        name: "Ride",
        fileType: "fit",
      },
      deps,
    );
    expect(deps.decodeActivityFile).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.cleanup).toHaveBeenCalledOnce();
  });

  it("retries a failed ingestion by returning it to uploaded before claiming", async () => {
    configureSuccess();
    mocks.createIngestion.mockResolvedValue(ingestion("failed"));
    mocks.markUploaded.mockResolvedValue({ ...ingestion(), status: "uploaded" });
    mocks.markProcessing.mockResolvedValue(ingestion("processing"));
    await processManualActivityFile(
      db(),
      {
        profileId,
        activityFilePath: `activities/${profileId}/uploads/ride.fit`,
        name: "Ride",
        fileType: "fit",
      },
      dependencies(),
    );
    expect(mocks.markUploaded).toHaveBeenCalledOnce();
    expect(mocks.markProcessing).toHaveBeenCalledOnce();
  });

  it("marks parse failures failed and leaves staging intact", async () => {
    mocks.createIngestion.mockResolvedValue(ingestion());
    mocks.markUploaded.mockResolvedValue({ ...ingestion(), status: "uploaded" });
    mocks.markProcessing.mockResolvedValue(ingestion("processing"));
    mocks.promote.mockResolvedValue({
      sha256: digest,
      byteSize: 3,
      bucket: "activity-files",
      path: `artifacts/sha256/${profileId}/${digest}`,
      format: "fit",
      stagingPath: `activities/${profileId}/uploads/ride.fit`,
    });
    const deps = dependencies();
    deps.decodeActivityFile.mockImplementation(() => {
      throw new TRPCError({ code: "BAD_REQUEST", message: "bad fit" });
    });
    await expect(
      processManualActivityFile(
        db(),
        {
          profileId,
          activityFilePath: `activities/${profileId}/uploads/ride.fit`,
          name: "Ride",
          fileType: "fit",
        },
        deps,
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.markFailed).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        errorCode: "parse_failed",
        errorMessage: "Unable to parse activity file",
      }),
    );
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

  it("does not mark failed or delete staging when another claimant owns the lease", async () => {
    mocks.createIngestion.mockResolvedValue(ingestion());
    mocks.markUploaded.mockResolvedValue({ ...ingestion(), status: "uploaded" });
    mocks.markProcessing.mockRejectedValue(new Error("conditional update lost"));
    await expect(
      processManualActivityFile(
        db(),
        {
          profileId,
          activityFilePath: `activities/${profileId}/uploads/ride.fit`,
          name: "Ride",
          fileType: "fit",
        },
        dependencies(),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.markFailed).not.toHaveBeenCalled();
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
});
