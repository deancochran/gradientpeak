import { randomUUID } from "node:crypto";
import { activityPlanSemanticHash } from "@repo/core/activity-plan";
import { activityPlans, type DrizzleDbClient } from "@repo/db";
import { and, eq, or } from "drizzle-orm";
import { PLANNED_SESSION_CACHE_TAGS } from "../../contracts/cache-receipts";
import {
  type ApplyPlannedSessionScenarioResult,
  applyPlannedSessionScenarioRequestSchema,
  applyPlannedSessionScenarioResultSchema,
} from "../../contracts/planned-session-scenario-apply";
import {
  plannedSessionMutationSchema,
  toPlannedSessionDto,
} from "../../contracts/planned-sessions";
import { type DrizzleTransactionClient, withProfileFencedRepeatableReadSnapshot } from "../../db";
import { createDrizzlePlannedSessionRepository } from "../../infrastructure/repositories";
import { activityPlanStructureHash } from "../activity-plans/structure-hash";
import {
  executeWithOperationReceipt,
  OperationReceiptUnauthorizedError,
} from "../operation-receipts";
import { getCurrentAthletePlanningDate } from "../training-plan/appliedScheduleUseCases";
import { cancelPlannedSession } from "./cancel-planned-session";
import { derivePlannedSessionScenario } from "./preview-planned-session-scenario";
import { assertPlannedSessionDateCanBeSkipped } from "./skip-planned-session";

/**
 * The provider outbox belongs inside this transaction. The held router will
 * supply the existing Wahoo/Garmin enqueue implementation rather than perform
 * an unsynchronized write after the receipt commits.
 */
export type EnqueueAppliedPlannedSessionScenario = (input: {
  tx: DrizzleTransactionClient;
  profileId: string;
  sessionId: string;
  planningDate: string;
  action: "publish" | "delete";
}) => Promise<void>;

class ScenarioApplyStaleAfterWriteError extends Error {
  override name = "ScenarioApplyStaleAfterWriteError";

  constructor(readonly result: Extract<ApplyPlannedSessionScenarioResult, { status: "stale" }>) {
    super("Scenario apply became stale after creating its private copy");
  }
}

function receipt(input: {
  action: "unchanged" | "repointed" | "cancelled" | "skipped";
  session: Parameters<typeof toPlannedSessionDto>[0];
  createdActivityPlanId?: string | null;
}) {
  return applyPlannedSessionScenarioResultSchema.parse({
    status: "applied",
    action: input.action,
    session: toPlannedSessionDto(input.session),
    createdActivityPlanId: input.createdActivityPlanId ?? null,
    cache_tags: PLANNED_SESSION_CACHE_TAGS,
  });
}

export async function applyPlannedSessionScenario(input: {
  db: DrizzleDbClient;
  actorId: string;
  profileId: string;
  request: unknown;
  now: Date;
  enqueueProviderSync: EnqueueAppliedPlannedSessionScenario;
  createRepository?: typeof createDrizzlePlannedSessionRepository;
}) {
  const request = applyPlannedSessionScenarioRequestSchema.parse(input.request);
  const createRepository = input.createRepository ?? createDrizzlePlannedSessionRepository;
  if (input.actorId !== input.profileId) throw new OperationReceiptUnauthorizedError();
  try {
    return await withProfileFencedRepeatableReadSnapshot(input.db, input.profileId, (tx) =>
      executeWithOperationReceipt({
        tx,
        actorId: input.actorId,
        operationId: request.operationId,
        command: "chatbot.planned-sessions.apply-scenario",
        semanticInput: {
          profileId: input.profileId,
          preview: request.preview,
          expectedPreviewFingerprint: request.expectedPreviewFingerprint,
        },
        output: applyPlannedSessionScenarioResultSchema,
        // This repeats after the durable receipt fence. The eventual router must
        // still derive actorId from the protected session, never client input.
        authorize: async (receiptTx) => {
          if (input.actorId !== input.profileId) return false;
          return Boolean(
            await createRepository(receiptTx).getOwned({
              profileId: input.profileId,
              sessionId: request.preview.sessionId,
            }),
          );
        },
        mutate: async (receiptTx): Promise<ApplyPlannedSessionScenarioResult> => {
          const repository = createRepository(receiptTx);
          const authoritySink: Parameters<typeof derivePlannedSessionScenario>[0]["authoritySink"] =
            {};
          const preview = await derivePlannedSessionScenario({
            db: receiptTx,
            repository,
            profileId: input.profileId,
            values: request.preview,
            now: input.now,
            authoritySink,
          });
          if (preview.status !== "available") return preview;
          if (preview.previewFingerprint !== request.expectedPreviewFingerprint) {
            return {
              status: "stale",
              reason: "preview_fingerprint",
              currentSessionRevision: preview.selectedSession.sessionRevision,
              currentPlanRevision: preview.provenance.selectedPlan.revision,
              currentStateRevision: preview.stateRevision,
            };
          }

          const selected = await repository.getOwned({
            profileId: input.profileId,
            sessionId: request.preview.sessionId,
          });
          if (!selected || selected.lifecycle.status !== "scheduled") {
            return { status: "unavailable", reason: "session_not_scheduled" };
          }

          if (request.preview.scenario.kind === "as_planned")
            return receipt({ action: "unchanged", session: selected });

          if (request.preview.scenario.kind === "skip") {
            const today = await getCurrentAthletePlanningDate({
              db: receiptTx,
              profileId: input.profileId,
              now: input.now,
            });
            if (selected.planningDate > today) {
              const cancelled = await cancelPlannedSession({
                repository,
                profileId: input.profileId,
                sessionId: selected.id,
                expectedRevision: selected.sessionRevision,
                reason: "user_requested",
                cancelledAt: input.now.toISOString(),
              });
              await input.enqueueProviderSync({
                tx: receiptTx,
                profileId: input.profileId,
                sessionId: cancelled.id,
                planningDate: cancelled.planningDate,
                action: "delete",
              });
              return receipt({ action: "cancelled", session: cancelled });
            }
            assertPlannedSessionDateCanBeSkipped({
              planningDate: selected.planningDate,
              currentPlanningDate: today,
            });
            const skipped = await repository.mutateOwned(
              plannedSessionMutationSchema.parse({
                action: "skip",
                profileId: input.profileId,
                sessionId: selected.id,
                expectedRevision: selected.sessionRevision,
                // The durable apply receipt owns retry identity. The legacy skipped
                // completion field remains UUID-shaped and must not reinterpret the
                // caller's opaque receipt operation ID.
                operationId: randomUUID(),
                skippedAt: input.now.toISOString(),
              }),
            );
            if (skipped.status !== "updated")
              throw new Error("Scenario skip did not update the session");
            await input.enqueueProviderSync({
              tx: receiptTx,
              profileId: input.profileId,
              sessionId: skipped.session.id,
              planningDate: skipped.session.planningDate,
              action: "delete",
            });
            return receipt({ action: "skipped", session: skipped.session });
          }

          const alternative = preview.provenance.selectedAlternative;
          const authority = authoritySink.current;
          if (!alternative || !authority)
            return { status: "unavailable", reason: "candidate_unavailable" };
          const [source] = await receiptTx
            .select()
            .from(activityPlans)
            .where(
              and(
                eq(activityPlans.id, alternative.activityPlanId),
                or(
                  eq(activityPlans.profile_id, input.profileId),
                  eq(activityPlans.content_visibility, "public"),
                  eq(activityPlans.is_system_template, true),
                ),
              ),
            )
            .limit(1);
          if (
            !source ||
            source.id !== authority.sourcePlan.id ||
            source.revision !== authority.sourcePlan.revision ||
            source.structure_hash !== authority.sourcePlan.structureHash ||
            source.semantic_hash !== authority.sourcePlan.semanticHash
          ) {
            return {
              status: "stale",
              reason: "preview_fingerprint",
              currentSessionRevision: selected.sessionRevision,
              currentPlanRevision: null,
              currentStateRevision: preview.stateRevision,
            };
          }
          const createdActivityPlanId = randomUUID();
          await receiptTx.insert(activityPlans).values({
            id: createdActivityPlanId,
            profile_id: input.profileId,
            name: `${source.name} (Scenario)`,
            description: source.description,
            notes: source.notes,
            structure: alternative.structure,
            structure_hash: activityPlanStructureHash(alternative.structure),
            semantic_hash: activityPlanSemanticHash({
              structure: alternative.structure,
              trainingIntent: source.training_intent,
            }),
            training_intent: source.training_intent,
            gps_recording_enabled: source.gps_recording_enabled,
            content_visibility: "private",
            is_system_template: false,
            created_at: input.now,
            updated_at: input.now,
          });
          const repointed = await repository.mutateOwned(
            plannedSessionMutationSchema.parse({
              action: "repoint_activity_plan",
              profileId: input.profileId,
              sessionId: selected.id,
              expectedRevision: selected.sessionRevision,
              activityPlanId: createdActivityPlanId,
            }),
          );
          if (repointed.status === "stale_revision")
            throw new ScenarioApplyStaleAfterWriteError({
              status: "stale",
              reason: "session_revision",
              currentSessionRevision: repointed.currentRevision,
              currentPlanRevision: preview.provenance.selectedPlan.revision,
              currentStateRevision: preview.stateRevision,
            });
          if (repointed.status !== "updated")
            throw new Error("Scenario apply did not repoint the session");
          await input.enqueueProviderSync({
            tx: receiptTx,
            profileId: input.profileId,
            sessionId: repointed.session.id,
            planningDate: repointed.session.planningDate,
            action: "publish",
          });
          return receipt({
            action: "repointed",
            session: repointed.session,
            createdActivityPlanId,
          });
        },
      }),
    );
  } catch (error) {
    if (error instanceof ScenarioApplyStaleAfterWriteError) return error.result;
    throw error;
  }
}
