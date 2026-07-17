import type { getRequiredDb } from "../../db";
import {
  acquireActivityEvidenceProfileLock,
  reconcileGeneratedActivityEvidenceWithProfileLockHeld,
} from "../activities/reconcile-activity-evidence";
import {
  analyzeParsedActivityFile,
  type ParsedActivityFileForAnalysis,
} from "./analyze-parsed-activity-file";

type DbClient = ReturnType<typeof getRequiredDb>;
type TransactionClient = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

export interface ParsedActivityEvidenceReplayItem {
  activityId: string;
  activityType: string;
  parsedData: ParsedActivityFileForAnalysis;
}

export interface ActivityEvidenceReconciliationCounts {
  effortDeletes: number;
  effortInserts: number;
  effortUpdates: number;
  metricDeletes: number;
  metricInserts: number;
  metricUpdates: number;
}

class DryRunProfileRollback extends Error {
  constructor(readonly results: ActivityEvidenceReconciliationCounts[]) {
    super("Rollback successful activity evidence dry-run");
  }
}

async function reconcileParsedActivityFileEvidenceWithProfileLockHeld(
  tx: TransactionClient,
  input: ParsedActivityEvidenceReplayItem & { profileId: string },
): Promise<ActivityEvidenceReconciliationCounts> {
  const analysis = await analyzeParsedActivityFile(tx, {
    activityId: input.activityId,
    profileId: input.profileId,
    parsedData: input.parsedData,
    refreshWeather: false,
  });
  const plan = await reconcileGeneratedActivityEvidenceWithProfileLockHeld(tx, {
    activityId: input.activityId,
    profileId: input.profileId,
    efforts: analysis.effortsToInsert,
    detectedLTHR: analysis.detectedLTHR,
    activityCompletedAt: analysis.activityCompletedAt,
    now: new Date(),
  });

  return {
    effortDeletes: plan.effortDeleteIds.length,
    effortInserts: plan.effortInserts.length,
    effortUpdates: plan.effortUpdates.length,
    metricDeletes: plan.metricDeleteIds.length,
    metricInserts: plan.metricInsert ? 1 : 0,
    metricUpdates: plan.metricUpdate ? 1 : 0,
  };
}

export async function replayParsedActivityFileEvidenceProfile(
  db: DbClient,
  input: {
    profileId: string;
    activities: ParsedActivityEvidenceReplayItem[];
    write: boolean;
  },
): Promise<ActivityEvidenceReconciliationCounts[]> {
  try {
    return await db.transaction(async (tx) => {
      await acquireActivityEvidenceProfileLock(tx, input.profileId);
      const results: ActivityEvidenceReconciliationCounts[] = [];
      for (const activity of input.activities) {
        results.push(
          await reconcileParsedActivityFileEvidenceWithProfileLockHeld(tx, {
            ...activity,
            profileId: input.profileId,
          }),
        );
      }
      if (!input.write) throw new DryRunProfileRollback(results);
      return results;
    });
  } catch (error) {
    if (error instanceof DryRunProfileRollback) return error.results;
    throw error;
  }
}

export async function reconcileParsedActivityFileEvidence(
  db: DbClient,
  input: {
    activityId: string;
    profileId: string;
    activityType: string;
    parsedData: ParsedActivityFileForAnalysis;
    write: boolean;
  },
) {
  const [result] = await replayParsedActivityFileEvidenceProfile(db, {
    profileId: input.profileId,
    activities: [input],
    write: input.write,
  });
  if (!result) throw new Error("Activity evidence replay returned no result");
  return result;
}
