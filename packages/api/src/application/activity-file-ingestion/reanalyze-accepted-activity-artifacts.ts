import { MAX_ACTIVITY_FILE_SIZE_BYTES } from "@repo/core/activity-files";
import { type ActivityFileType, parseActivityFile } from "@repo/core/server/activity-files";
import type { DrizzleDbClient } from "@repo/db";
import { z } from "zod";
import { withProfileFencedRepeatableReadSnapshot } from "../../db";
import {
  type CurrentAcceptedActivitySourceState,
  listProfileCurrentAcceptedActivityArtifacts,
  type ProfileAcceptedActivityArtifact,
  readCurrentAcceptedActivitySourceState,
} from "../../repositories/profile-accepted-activity-artifact-repository";
import { reconcileGeneratedActivityEvidenceWithProfileLockHeld } from "../activities/reconcile-activity-evidence";
import {
  analyzeParsedActivityFile,
  type ParsedActivityFileAnalysis,
} from "./analyze-parsed-activity-file";
import {
  type ActivityArtifactStorage,
  activityArtifactContentPath,
  activityArtifactSha256,
} from "./artifact-storage";

export const ACCEPTED_ARTIFACT_REANALYSIS_PAGE_SIZE = 25;

export type ReanalyzeProfileActivityArtifactsInput = {
  profileId: string;
  apply: boolean;
  confirmProfileId?: string;
  now?: Date;
  pageSize?: number;
};

export type ReanalyzeProfileActivityArtifactsResult = {
  mode: "apply" | "dry_run";
  status: "completed";
  pages: number;
  artifactsSelected: number;
  artifactsVerified: number;
  artifactsAnalyzed: number;
  generatedEfforts: number;
  generatedLthrEfforts: number;
  insertedEfforts: number;
  insertedLthrEfforts: number;
  artifactsCalibrated: number;
  calibration: "completed" | "not_requested";
  historicalDerivedStateReplay: "pending_existing_command" | "not_requested";
};

type ApplyArtifactResult = {
  insertedEfforts: number;
  insertedLthrEfforts: number;
  calibration: "completed";
};

export interface ReanalyzeProfileActivityArtifactsDependencies {
  listPage(input: {
    db: DrizzleDbClient;
    profileId: string;
    limit: number;
    cursor?: { activityId: string; startedAt: Date };
  }): Promise<ProfileAcceptedActivityArtifact[]>;
  readVerifiedBytes(input: {
    artifact: ProfileAcceptedActivityArtifact;
    profileId: string;
    storage: ActivityArtifactStorage;
  }): Promise<Uint8Array>;
  analyze(input: {
    artifact: ProfileAcceptedActivityArtifact;
    bytes: Uint8Array;
    db: DrizzleDbClient;
    profileId: string;
  }): Promise<ParsedActivityFileAnalysis>;
  validateDryRun(input: {
    analysis: ParsedActivityFileAnalysis;
    artifact: ProfileAcceptedActivityArtifact;
    db: DrizzleDbClient;
    profileId: string;
  }): Promise<void>;
  applyArtifact(input: {
    analysis: ParsedActivityFileAnalysis;
    artifact: ProfileAcceptedActivityArtifact;
    db: DrizzleDbClient;
    now: Date;
    profileId: string;
  }): Promise<ApplyArtifactResult>;
}

function assertSameInstant(actual: Date, expected: Date, label: string) {
  if (actual.getTime() !== expected.getTime()) {
    throw new Error(`Reanalysis would rewrite immutable activity ${label}`);
  }
}

/** Refuses evidence-only replay when the parser would change parent or segment identity. */
export function assertReanalysisPreservesAcceptedSource(
  source: CurrentAcceptedActivitySourceState | null,
  artifact: ProfileAcceptedActivityArtifact,
  analysis: ParsedActivityFileAnalysis,
) {
  if (!source) throw new Error("Accepted activity source changed during reanalysis");
  assertSameInstant(analysis.startedAt, source.startedAt, "start");
  assertSameInstant(analysis.activityCompletedAt, source.finishedAt, "finish");
  if (source.segmentsRevision !== artifact.segmentsRevision) {
    throw new Error("Accepted activity source revision changed during reanalysis");
  }
  if (source.segments.length !== analysis.segmentSet.segments.length) {
    throw new Error("Reanalysis would rewrite immutable activity segment identity");
  }
  for (const [index, analyzed] of analysis.segmentSet.segments.entries()) {
    const persisted = source.segments[index];
    const analyzedSource = analyzed.source?.kind === "artifact" ? analyzed.source : null;
    if (
      !persisted ||
      persisted.id !== analyzed.id ||
      persisted.ordinal !== analyzed.ordinal ||
      persisted.role !== analyzed.role ||
      persisted.activityCategory !==
        (analyzed.role === "activity" ? analyzed.activity_category : null) ||
      persisted.startOffsetMs !== analyzed.startOffsetMs ||
      persisted.endOffsetMs !== analyzed.endOffsetMs ||
      persisted.segmentRevision !== source.segmentsRevision ||
      persisted.sourceArtifactId !== artifact.artifactId ||
      analyzedSource?.artifactId !== artifact.artifactId ||
      persisted.sourceSessionIndex !== (analyzedSource.sessionMessageIndex ?? null) ||
      persisted.sourceMessageIndex !== (analyzedSource.messageIndex ?? null) ||
      persisted.rawTypeString !==
        (typeof analyzedSource.rawType === "string" ? analyzedSource.rawType : null) ||
      persisted.rawTypeInteger !==
        (typeof analyzedSource.rawType === "number" ? analyzedSource.rawType : null) ||
      persisted.rawSportString !==
        (typeof analyzedSource.rawSport === "string" ? analyzedSource.rawSport : null) ||
      persisted.rawSportInteger !==
        (typeof analyzedSource.rawSport === "number" ? analyzedSource.rawSport : null) ||
      persisted.rawSubSportString !==
        (typeof analyzedSource.rawSubSport === "string" ? analyzedSource.rawSubSport : null) ||
      persisted.rawSubSportInteger !==
        (typeof analyzedSource.rawSubSport === "number" ? analyzedSource.rawSubSport : null)
    ) {
      throw new Error("Reanalysis would rewrite immutable activity segment identity");
    }
  }
}

export function verifyDownloadedAcceptedActivityArtifact(input: {
  artifact: ProfileAcceptedActivityArtifact;
  bytes: Uint8Array;
  profileId: string;
}) {
  const expectedPath = activityArtifactContentPath(input.profileId, input.artifact.digest);
  if (input.artifact.bucket !== "activity-files" || input.artifact.path !== expectedPath) {
    throw new Error("Accepted activity artifact storage identity is not canonical");
  }
  if (
    input.bytes.byteLength !== input.artifact.byteSize ||
    activityArtifactSha256(input.bytes) !== input.artifact.digest
  ) {
    throw new Error("Accepted activity artifact digest or size verification failed");
  }
  return input.bytes;
}

async function defaultReadVerifiedBytes(input: {
  artifact: ProfileAcceptedActivityArtifact;
  profileId: string;
  storage: ActivityArtifactStorage;
}) {
  const { data } = await input.storage.readObjectBounded({
    bucket: input.artifact.bucket,
    path: input.artifact.path,
    maxBytes: MAX_ACTIVITY_FILE_SIZE_BYTES,
  });
  return verifyDownloadedAcceptedActivityArtifact({
    artifact: input.artifact,
    bytes: data,
    profileId: input.profileId,
  });
}

async function readAndAssertCurrentSource(input: {
  analysis: ParsedActivityFileAnalysis;
  artifact: ProfileAcceptedActivityArtifact;
  db: Parameters<typeof readCurrentAcceptedActivitySourceState>[0];
  profileId: string;
}) {
  const source = await readCurrentAcceptedActivitySourceState(input.db, {
    profileId: input.profileId,
    activityId: input.artifact.activityId,
    artifactId: input.artifact.artifactId,
  });
  assertReanalysisPreservesAcceptedSource(source, input.artifact, input.analysis);
}

/** Commits generated efforts and their calibration effects in one profile-fenced transaction. */
export async function reconcileReanalyzedArtifactAtomically(input: {
  analysis: ParsedActivityFileAnalysis;
  artifact: ProfileAcceptedActivityArtifact;
  db: DrizzleDbClient;
  now: Date;
  profileId: string;
}): Promise<ApplyArtifactResult> {
  return withProfileFencedRepeatableReadSnapshot(input.db, input.profileId, async (tx) => {
    await readAndAssertCurrentSource({ ...input, db: tx });
    const reconciliation = await reconcileGeneratedActivityEvidenceWithProfileLockHeld(tx, {
      profileId: input.profileId,
      activityId: input.artifact.activityId,
      efforts: input.analysis.effortsToInsert,
      detectedLTHR: input.analysis.detectedLTHR,
      now: input.now,
    });
    if (reconciliation.calibrationReconciliation === null) {
      throw new Error("Activity calibration was not reconciled atomically");
    }
    return {
      insertedEfforts: reconciliation.effortInserts.length,
      insertedLthrEfforts: reconciliation.effortInserts.filter(
        (effort) => effort.method === "activity_file_lthr_detection",
      ).length,
      calibration: "completed",
    };
  });
}

const defaultDependencies: ReanalyzeProfileActivityArtifactsDependencies = {
  listPage: ({ db, ...input }) => listProfileCurrentAcceptedActivityArtifacts(db, input),
  readVerifiedBytes: defaultReadVerifiedBytes,
  analyze: async ({ artifact, bytes, db, profileId }) => {
    const parsedData = parseActivityFile({
      data: bytes,
      fileName: artifact.path,
      fileType: artifact.format satisfies ActivityFileType,
    });
    return analyzeParsedActivityFile(db, {
      profileId,
      activityId: artifact.activityId,
      artifactId: artifact.artifactId,
      parsedData,
      refreshWeather: false,
    });
  },
  validateDryRun: readAndAssertCurrentSource,
  applyArtifact: reconcileReanalyzedArtifactAtomically,
};

export async function reanalyzeProfileActivityArtifacts(
  db: DrizzleDbClient,
  storage: ActivityArtifactStorage,
  input: ReanalyzeProfileActivityArtifactsInput,
  dependencies: ReanalyzeProfileActivityArtifactsDependencies = defaultDependencies,
): Promise<ReanalyzeProfileActivityArtifactsResult> {
  z.string().uuid().parse(input.profileId);
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("Reanalysis time is invalid");
  if (input.apply && input.confirmProfileId !== input.profileId) {
    throw new Error("Apply requires a confirmation profile ID that exactly matches the profile ID");
  }
  if (!input.apply && input.confirmProfileId !== undefined) {
    throw new Error("A confirmation profile ID is only valid when applying changes");
  }
  const pageSize = input.pageSize ?? ACCEPTED_ARTIFACT_REANALYSIS_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error("Reanalysis page size must be between 1 and 100");
  }

  let cursor: { activityId: string; startedAt: Date } | undefined;
  let pages = 0;
  let artifactsSelected = 0;
  let artifactsVerified = 0;
  let artifactsAnalyzed = 0;
  let generatedEfforts = 0;
  let generatedLthrEfforts = 0;
  let insertedEfforts = 0;
  let insertedLthrEfforts = 0;
  let artifactsCalibrated = 0;
  const processedActivityIds = new Set<string>();

  for (;;) {
    const page = await dependencies.listPage({
      db,
      profileId: input.profileId,
      limit: pageSize,
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (page.length === 0) break;
    if (page.length > pageSize) throw new Error("Accepted artifact reader exceeded its page bound");
    pages += 1;
    for (const artifact of page) {
      if (processedActivityIds.has(artifact.activityId)) {
        throw new Error("Accepted artifact pagination repeated an activity");
      }
      processedActivityIds.add(artifact.activityId);
      artifactsSelected += 1;
      const bytes = await dependencies.readVerifiedBytes({
        artifact,
        profileId: input.profileId,
        storage,
      });
      artifactsVerified += 1;
      const analysis = await dependencies.analyze({
        artifact,
        bytes,
        db,
        profileId: input.profileId,
      });
      artifactsAnalyzed += 1;
      generatedEfforts += analysis.effortsToInsert.length;
      generatedLthrEfforts += analysis.effortsToInsert.filter(
        (effort) => effort.method === "activity_file_lthr_detection",
      ).length;
      if (input.apply) {
        const applied = await dependencies.applyArtifact({
          analysis,
          artifact,
          db,
          now,
          profileId: input.profileId,
        });
        if (applied.calibration !== "completed") {
          throw new Error("Activity calibration did not complete with evidence reconciliation");
        }
        insertedEfforts += applied.insertedEfforts;
        insertedLthrEfforts += applied.insertedLthrEfforts;
        artifactsCalibrated += 1;
      } else {
        await dependencies.validateDryRun({
          analysis,
          artifact,
          db,
          profileId: input.profileId,
        });
      }
    }
    const last = page.at(-1);
    if (!last) throw new Error("Accepted artifact page omitted its cursor");
    cursor = { activityId: last.activityId, startedAt: last.startedAt };
    if (page.length < pageSize) break;
  }

  return {
    mode: input.apply ? "apply" : "dry_run",
    status: "completed",
    pages,
    artifactsSelected,
    artifactsVerified,
    artifactsAnalyzed,
    generatedEfforts,
    generatedLthrEfforts,
    insertedEfforts,
    insertedLthrEfforts,
    artifactsCalibrated,
    calibration: input.apply && artifactsCalibrated > 0 ? "completed" : "not_requested",
    historicalDerivedStateReplay:
      input.apply && artifactsSelected > 0 ? "pending_existing_command" : "not_requested",
  };
}
