import {
  completedActivityPerformanceTargetSnapshotSchema,
  completedSegmentSummarySchema,
  getCalendarDateInIanaZone,
} from "@repo/core";
import {
  type ActivityTrainingEffect,
  ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
  activityTrainingEffectSchema,
} from "@repo/core/athlete-derived-state";
import { activities, activitySegments } from "@repo/db";
import { and, asc, eq } from "drizzle-orm";
import type { DrizzleQueryExecutor, DrizzleTransactionClient } from "../../db";
import {
  createActivityAnalysisStore,
  createDrizzleAthleteDerivedStateRepository,
} from "../../infrastructure/repositories";
import {
  buildActivitySegmentDerivedSummaries,
  projectCanonicalCompletedObservationLoads,
  type SegmentDerivedSummary,
} from "../../lib/activity-analysis";
import {
  activityAnalysisFingerprint,
  appendActivityAnalysisRevision,
  readMatchingActivityAnalysisRevision,
} from "../../repositories/activity-analysis-revision-repository";
import type { AthleteDerivedStateRepositoryPort } from "../../repositories/athlete-derived-state-repository-port";
import { recordActivityTrainingEffect } from "./record-activity-training-effect";
import {
  buildAthleteRecalculationRequest,
  requestAthleteRecalculation,
} from "./request-athlete-recalculation";

function confidenceForQuality(value: "high" | "low" | "medium" | "unknown") {
  return value === "high" ? 0.95 : value === "medium" ? 0.8 : value === "low" ? 0.6 : 0.5;
}

function earliestEffectiveAt(...values: Array<Date | null | undefined>) {
  const instants = values.filter((value): value is Date => value !== null && value !== undefined);
  return instants.length === 0
    ? null
    : new Date(Math.min(...instants.map((value) => value.getTime())));
}

export function resolveAthleteStateMaterialEffectiveAt(input: {
  activityFinishedAt: Date;
  activityMaterialChanged: boolean;
  effortMaterialRecordedAt?: Date | null;
}) {
  const effortEffectiveAt = input.effortMaterialRecordedAt
    ? new Date(
        Math.max(input.activityFinishedAt.getTime(), input.effortMaterialRecordedAt.getTime()),
      )
    : null;
  return earliestEffectiveAt(
    input.activityMaterialChanged ? input.activityFinishedAt : null,
    effortEffectiveAt,
  );
}

/**
 * Replay begins at the earliest affected evidence, while claim eligibility must
 * wait for the latest observed boundary that supplied that evidence.
 */
export function resolveAthleteStateMaterialEligibilityAt(input: {
  activityFinishedAt: Date;
  activityMaterialChanged: boolean;
  effortMaterialRecordedAt?: Date | null;
}) {
  if (input.effortMaterialRecordedAt) {
    return new Date(
      Math.max(input.activityFinishedAt.getTime(), input.effortMaterialRecordedAt.getTime()),
    );
  }
  return input.activityMaterialChanged ? input.activityFinishedAt : null;
}

export function hasEquivalentActivityTrainingEffectContent(
  existing: ActivityTrainingEffect,
  candidate: ActivityTrainingEffect,
) {
  const existingCapability = existing.stimulus.capabilityObservation;
  const candidateCapability = candidate.stimulus.capabilityObservation;
  return (
    existing.contractVersion === candidate.contractVersion &&
    existing.profileId === candidate.profileId &&
    existing.activityId === candidate.activityId &&
    existing.activityAnalysisRevision === candidate.activityAnalysisRevision &&
    existing.effectiveAt === candidate.effectiveAt &&
    existing.planningDate === candidate.planningDate &&
    existing.calculationVersion === candidate.calculationVersion &&
    existing.inputFingerprint === candidate.inputFingerprint &&
    existing.stimulus.kind === candidate.stimulus.kind &&
    existing.stimulus.sourceId === candidate.stimulus.sourceId &&
    existing.stimulus.occurredAt === candidate.stimulus.occurredAt &&
    existing.stimulus.activityCategory === candidate.stimulus.activityCategory &&
    existing.stimulus.commonLoad === candidate.stimulus.commonLoad &&
    existing.stimulus.evidenceConfidence === candidate.stimulus.evidenceConfidence &&
    existingCapability?.distanceMeters === candidateCapability?.distanceMeters &&
    existingCapability?.durationMinutes === candidateCapability?.durationMinutes
  );
}

async function queueEquivalentActivityTrainingEffectRevision(input: {
  repository: AthleteDerivedStateRepositoryPort;
  profileId: string;
  planningTimezone: string;
  effectiveAt: Date;
  targetSourceRevision: number;
  reason: "activity_created" | "analysis_replaced";
  requestedAt: Date;
}) {
  return requestAthleteRecalculation({
    repository: input.repository,
    profileId: input.profileId,
    request: buildAthleteRecalculationRequest({
      profileId: input.profileId,
      earliestAffectedAt: input.effectiveAt.toISOString(),
      earliestAffectedPlanningDate: getCalendarDateInIanaZone(
        input.effectiveAt.toISOString(),
        input.planningTimezone,
      ),
      sourceRevision: input.targetSourceRevision,
      reasons: [input.reason],
      requestedAt: input.requestedAt.toISOString(),
    }),
  });
}

export async function materializeActivityAthleteStateEvidence(
  tx: DrizzleTransactionClient,
  input: {
    profileId: string;
    activityId: string;
    computedAt: Date;
    contextDb: DrizzleQueryExecutor;
    canonicalEvidenceMaterialChanged?: boolean;
    allowIncrementalApply?: boolean;
    deferAthleteStateRefresh?: boolean;
    targetSourceRevision?: number;
    effortMaterialRecordedAt?: Date | null;
    preparedSegmentSummaries?: readonly SegmentDerivedSummary[];
  },
) {
  const [activity] = await tx
    .select()
    .from(activities)
    .where(and(eq(activities.id, input.activityId), eq(activities.profile_id, input.profileId)))
    .limit(1);
  if (!activity) throw new Error("Athlete state activity evidence is unavailable");
  if (activity.finished_at === null) {
    const hasPersistedEvidence =
      activity.athlete_state_common_load !== null ||
      activity.athlete_state_activity_category !== null ||
      activity.athlete_state_evidence_confidence !== null ||
      activity.athlete_state_capability_distance_meters !== null ||
      activity.athlete_state_capability_duration_minutes !== null ||
      activity.athlete_state_input_version !== null ||
      activity.athlete_state_computed_at !== null;
    if (hasPersistedEvidence) {
      await tx
        .update(activities)
        .set({
          athlete_state_common_load: null,
          athlete_state_activity_category: null,
          athlete_state_evidence_confidence: null,
          athlete_state_capability_distance_meters: null,
          athlete_state_capability_duration_minutes: null,
          athlete_state_input_version: null,
          athlete_state_computed_at: null,
        })
        .where(
          and(eq(activities.id, input.activityId), eq(activities.profile_id, input.profileId)),
        );
    }
    await createDrizzleAthleteDerivedStateRepository(tx).deleteActivityTrainingEffects({
      profileId: input.profileId,
      activityId: input.activityId,
    });
    return { commonLoad: null, confidence: null, effectiveAt: null, materialChanged: false };
  }
  const segments = await tx
    .select()
    .from(activitySegments)
    .where(
      and(
        eq(activitySegments.activity_id, input.activityId),
        eq(activitySegments.profile_id, input.profileId),
      ),
    )
    .orderBy(asc(activitySegments.ordinal));
  const summaries = input.preparedSegmentSummaries
    ? [...input.preparedSegmentSummaries]
    : await buildActivitySegmentDerivedSummaries({
        store: createActivityAnalysisStore(input.contextDb),
        profileId: input.profileId,
        activities: [{ ...activity, segments }],
        computedAsOf: input.computedAt,
      });
  if (
    summaries.length !== segments.length ||
    summaries.some(
      (summary, index) =>
        summary.activity_id !== activity.id || summary.segment_id !== segments[index]?.id,
    )
  ) {
    throw new Error("Prepared activity analysis does not match current activity segments");
  }
  let analysisRevision = await readMatchingActivityAnalysisRevision(tx, {
    activityId: input.activityId,
    profileId: input.profileId,
    sourceSegmentsRevision: activity.segments_revision ?? 1,
  });
  if (
    !analysisRevision &&
    summaries.length > 0 &&
    (!input.deferAthleteStateRefresh || input.targetSourceRevision !== undefined)
  ) {
    const originalSnapshot = completedActivityPerformanceTargetSnapshotSchema.parse(
      activity.performance_target_snapshot,
    );
    const projection = {
      version: 1 as const,
      segments: summaries.map((summary) => {
        const observation = summary.observationQuantification.members[0];
        if (!observation || summary.observationQuantification.members.length !== 1) {
          throw new Error("Activity analysis segment must contain exactly one observation");
        }
        return {
          segmentId: summary.segment_id,
          activityCategory: summary.activity_category,
          commonLoad: observation.commonLoad,
        };
      }),
    };
    analysisRevision = await appendActivityAnalysisRevision(tx, {
      activityId: input.activityId,
      profileId: input.profileId,
      sourceSegmentsRevision: activity.segments_revision ?? 1,
      performanceTargets: originalSnapshot.targets,
      targetFingerprint: activityAnalysisFingerprint(originalSnapshot.targets),
      segmentLoadProjection: projection,
      outputFingerprint: activityAnalysisFingerprint(projection),
      computedAt: input.computedAt,
    });
  }
  const usableLoads: Array<{
    activityCategory: SegmentDerivedSummary["activity_category"];
    load: number;
    qualityConfidence: "high" | "low" | "medium" | "unknown";
    sourceTimeCoverage: number;
  }> = [];
  for (const observation of projectCanonicalCompletedObservationLoads(summaries)) {
    const commonLoad = observation.commonLoad;
    if (commonLoad.status === "available") {
      usableLoads.push({
        activityCategory: commonLoad.activity_category,
        load: commonLoad.load,
        qualityConfidence: commonLoad.quality.confidence,
        sourceTimeCoverage: 1,
      });
    } else if (
      commonLoad.status === "partial" &&
      commonLoad.load !== null &&
      commonLoad.quality !== null
    ) {
      usableLoads.push({
        activityCategory: commonLoad.activity_category,
        load: commonLoad.load,
        qualityConfidence: commonLoad.quality.confidence,
        sourceTimeCoverage: commonLoad.sourceTimeCoverage,
      });
    }
  }
  if (usableLoads.length === 0) {
    const activityProjectionChanged =
      activity.athlete_state_common_load !== null ||
      activity.athlete_state_activity_category !== null ||
      activity.athlete_state_evidence_confidence !== null ||
      activity.athlete_state_capability_distance_meters !== null ||
      activity.athlete_state_capability_duration_minutes !== null ||
      activity.athlete_state_input_version !== null ||
      activity.athlete_state_computed_at !== null;
    const activityMaterialChanged =
      activityProjectionChanged || input.canonicalEvidenceMaterialChanged === true;
    const effectiveAt = resolveAthleteStateMaterialEffectiveAt({
      activityFinishedAt: activity.finished_at,
      activityMaterialChanged,
      ...(input.effortMaterialRecordedAt !== undefined
        ? { effortMaterialRecordedAt: input.effortMaterialRecordedAt }
        : {}),
    });
    const materialChanged = effectiveAt !== null;
    if (activityProjectionChanged) {
      await tx
        .update(activities)
        .set({
          athlete_state_common_load: null,
          athlete_state_activity_category: null,
          athlete_state_evidence_confidence: null,
          athlete_state_capability_distance_meters: null,
          athlete_state_capability_duration_minutes: null,
          athlete_state_input_version: null,
          athlete_state_computed_at: null,
        })
        .where(
          and(eq(activities.id, input.activityId), eq(activities.profile_id, input.profileId)),
        );
    }
    await createDrizzleAthleteDerivedStateRepository(tx).deleteActivityTrainingEffects({
      profileId: input.profileId,
      activityId: input.activityId,
    });
    if (effectiveAt !== null && !input.deferAthleteStateRefresh) {
      if (!analysisRevision) throw new Error("Activity analysis revision is unavailable");
      const repository = createDrizzleAthleteDerivedStateRepository(tx);
      const state = await repository.lockPublicationState({ profileId: input.profileId });
      if (!state) throw new Error("Athlete publication state is unavailable");
      await requestAthleteRecalculation({
        repository,
        profileId: input.profileId,
        request: buildAthleteRecalculationRequest({
          profileId: input.profileId,
          earliestAffectedAt: effectiveAt.toISOString(),
          earliestAffectedPlanningDate: getCalendarDateInIanaZone(
            effectiveAt.toISOString(),
            state.planningTimezone,
          ),
          sourceRevision: state.sourceRevision + 1,
          reasons: [analysisRevision.revision === 1 ? "activity_created" : "analysis_replaced"],
          requestedAt: input.computedAt.toISOString(),
        }),
      });
    }
    return { commonLoad: null, confidence: null, effectiveAt, materialChanged };
  }
  const primary = [...usableLoads].sort((left, right) => right.load - left.load)[0];
  if (!primary) throw new Error("Canonical activity Common Load lost provenance");
  let commonLoad = 0;
  let confidence = 1;
  for (const observation of usableLoads) {
    commonLoad += observation.load;
    confidence = Math.min(
      confidence,
      confidenceForQuality(observation.qualityConfidence) * observation.sourceTimeCoverage,
    );
  }
  let capabilityDistanceMeters: number | null = null;
  let capabilityDurationMinutes: number | null = null;
  for (const segment of segments) {
    if (segment.role !== "activity" || segment.activity_category !== primary.activityCategory)
      continue;
    const summary = completedSegmentSummarySchema.parse(segment.summary);
    capabilityDistanceMeters = Math.max(capabilityDistanceMeters ?? 0, summary.distanceMeters ?? 0);
    const timing = summary.timing;
    const durationMs =
      "movingMs" in timing && timing.movingMs !== undefined
        ? timing.movingMs
        : "activeMs" in timing && timing.activeMs !== undefined
          ? timing.activeMs
          : segment.end_offset_ms - segment.start_offset_ms;
    capabilityDurationMinutes = Math.max(capabilityDurationMinutes ?? 0, durationMs / 60_000);
  }
  const activityMaterialChanged =
    input.canonicalEvidenceMaterialChanged === true ||
    activity.athlete_state_common_load !== commonLoad ||
    activity.athlete_state_activity_category !== primary.activityCategory ||
    activity.athlete_state_evidence_confidence !== confidence ||
    activity.athlete_state_capability_distance_meters !== capabilityDistanceMeters ||
    activity.athlete_state_capability_duration_minutes !== capabilityDurationMinutes ||
    activity.athlete_state_input_version !== "canonical-activity-state-v1";
  const effectiveAt = resolveAthleteStateMaterialEffectiveAt({
    activityFinishedAt: activity.finished_at,
    activityMaterialChanged,
    ...(input.effortMaterialRecordedAt !== undefined
      ? { effortMaterialRecordedAt: input.effortMaterialRecordedAt }
      : {}),
  });
  const eligibilityAt = resolveAthleteStateMaterialEligibilityAt({
    activityFinishedAt: activity.finished_at,
    activityMaterialChanged,
    ...(input.effortMaterialRecordedAt !== undefined
      ? { effortMaterialRecordedAt: input.effortMaterialRecordedAt }
      : {}),
  });
  const materialChanged = effectiveAt !== null;
  if (effectiveAt === null) return { commonLoad, confidence, effectiveAt, materialChanged };
  await tx
    .update(activities)
    .set({
      athlete_state_common_load: commonLoad,
      athlete_state_activity_category: primary.activityCategory,
      athlete_state_evidence_confidence: confidence,
      athlete_state_capability_distance_meters: capabilityDistanceMeters,
      athlete_state_capability_duration_minutes: capabilityDurationMinutes,
      athlete_state_input_version: "canonical-activity-state-v1",
      athlete_state_computed_at: input.computedAt,
    })
    .where(and(eq(activities.id, input.activityId), eq(activities.profile_id, input.profileId)));
  if (!input.deferAthleteStateRefresh || input.targetSourceRevision !== undefined) {
    if (!analysisRevision) throw new Error("Activity analysis revision is unavailable");
    const repository = createDrizzleAthleteDerivedStateRepository(tx);
    const state = await repository.lockPublicationState({ profileId: input.profileId });
    if (!state) throw new Error("Athlete publication state is unavailable");
    const targetSourceRevision = input.targetSourceRevision ?? state.sourceRevision + 1;
    const effect = activityTrainingEffectSchema.parse({
      contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
      profileId: input.profileId,
      activityId: input.activityId,
      activityAnalysisRevision: analysisRevision.revision,
      effectiveAt: activity.finished_at.toISOString(),
      planningDate: getCalendarDateInIanaZone(
        activity.finished_at.toISOString(),
        state.planningTimezone,
      ),
      sourceRevision: targetSourceRevision,
      calculationVersion: analysisRevision.analysisVersion,
      inputFingerprint: analysisRevision.outputFingerprint.replace(/^sha256:/, ""),
      stimulus: {
        kind: "observed",
        sourceId: input.activityId,
        occurredAt: activity.finished_at.toISOString(),
        activityCategory: primary.activityCategory,
        commonLoad,
        evidenceConfidence: confidence,
        capabilityObservation:
          capabilityDistanceMeters === null && capabilityDurationMinutes === null
            ? null
            : {
                distanceMeters: capabilityDistanceMeters,
                durationMinutes: capabilityDurationMinutes,
              },
      },
    });
    const reason = analysisRevision.revision === 1 ? "activity_created" : "analysis_replaced";
    const queueEquivalentRevision = () =>
      queueEquivalentActivityTrainingEffectRevision({
        repository,
        profileId: input.profileId,
        planningTimezone: state.planningTimezone,
        effectiveAt,
        targetSourceRevision,
        reason,
        requestedAt: input.computedAt,
      });
    const mustQueueWithoutIncrementalApply =
      input.allowIncrementalApply === false ||
      (eligibilityAt !== null && eligibilityAt.getTime() > input.computedAt.getTime());
    if (input.deferAthleteStateRefresh) {
      const written = await repository.upsertActivityTrainingEffect({
        profileId: input.profileId,
        effect,
      });
      if (written.status === "identity_conflict") {
        const existing = await repository.readActivityTrainingEffect({
          profileId: input.profileId,
          activityId: input.activityId,
          activityAnalysisRevision: analysisRevision.revision,
        });
        if (!existing || !hasEquivalentActivityTrainingEffectContent(existing, effect)) {
          throw new Error("Activity training effect identity conflict");
        }
        await queueEquivalentRevision();
      }
    } else if (mustQueueWithoutIncrementalApply) {
      const written = await repository.upsertActivityTrainingEffect({
        profileId: input.profileId,
        effect,
      });
      if (written.status === "identity_conflict") {
        const existing = await repository.readActivityTrainingEffect({
          profileId: input.profileId,
          activityId: input.activityId,
          activityAnalysisRevision: analysisRevision.revision,
        });
        if (!existing || !hasEquivalentActivityTrainingEffectContent(existing, effect)) {
          throw new Error("Activity training effect identity conflict");
        }
      }
      await queueEquivalentRevision();
    } else {
      const existing = await repository.readActivityTrainingEffect({
        profileId: input.profileId,
        activityId: input.activityId,
        activityAnalysisRevision: analysisRevision.revision,
      });
      if (existing) {
        if (!hasEquivalentActivityTrainingEffectContent(existing, effect)) {
          throw new Error("Activity training effect identity conflict");
        }
        await queueEquivalentRevision();
      } else {
        await recordActivityTrainingEffect({
          repository,
          request: {
            profileId: input.profileId,
            expectedPublishedRevision: state.publishedRevision,
            targetSourceRevision,
            effect,
          },
          reason,
          requestedAt: input.computedAt.toISOString(),
        });
      }
    }
  }
  return { commonLoad, confidence, effectiveAt, materialChanged };
}
