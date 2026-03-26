import { type InferredStateSnapshot, inferredStateSnapshotSchema } from "@repo/core";
import type { Database, Json } from "@repo/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";
import type {
  CreatedTrainingPlanRecord,
  CreateTrainingPlanRecordInput,
  TrainingPlanRepository,
} from "../../repositories";

export function createSupabaseTrainingPlanRepository(
  supabase: SupabaseClient<Database>,
): TrainingPlanRepository {
  const parseTrainingPlanStructure = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  };

  const parsePriorSnapshotFromStructure = (structure: unknown): InferredStateSnapshot | null => {
    const parsedStructure = parseTrainingPlanStructure(structure);
    if (!parsedStructure) {
      return null;
    }

    const metadata = parsedStructure.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return null;
    }

    const candidate = (metadata as Record<string, unknown>).inferred_state_snapshot;
    const parsedSnapshot = inferredStateSnapshotSchema.safeParse(candidate);
    if (!parsedSnapshot.success) {
      return null;
    }

    return parsedSnapshot.data;
  };

  const resolveTargetPlan = async (input: {
    profileId: string;
    trainingPlanId?: string;
  }): Promise<{
    id: string;
    structure: unknown;
  } | null> => {
    if (input.trainingPlanId) {
      const { data, error } = await supabase
        .from("training_plans")
        .select("id, structure")
        .eq("id", input.trainingPlanId)
        .eq("profile_id", input.profileId)
        .single();

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }

      return data ? { id: data.id, structure: data.structure } : null;
    }

    const { data: activeEvents, error: eventsError } = await supabase
      .from("events")
      .select("training_plan_id, starts_at")
      .eq("profile_id", input.profileId)
      .eq("event_type", "planned_activity")
      .not("training_plan_id", "is", null)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(1);

    if (eventsError) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: eventsError.message,
      });
    }

    const activePlanId = activeEvents?.[0]?.training_plan_id;
    if (!activePlanId) {
      return null;
    }

    const { data: activePlan, error: activePlanError } = await supabase
      .from("training_plans")
      .select("id, structure")
      .eq("id", activePlanId)
      .eq("profile_id", input.profileId)
      .maybeSingle();

    if (activePlanError) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: activePlanError.message,
      });
    }

    return activePlan ? { id: activePlan.id, structure: activePlan.structure } : null;
  };

  return {
    async createTrainingPlan(
      input: CreateTrainingPlanRecordInput,
    ): Promise<CreatedTrainingPlanRecord> {
      const { data, error } = await supabase
        .from("training_plans")
        .insert({
          name: input.name,
          description: input.description,
          structure: input.structure as Json,
          profile_id: input.profileId,
        })
        .select("*")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error?.message ?? "Failed to create training plan",
        });
      }

      return data as CreatedTrainingPlanRecord;
    },

    async getPriorInferredStateSnapshot(profileId: string) {
      const plan = await resolveTargetPlan({ profileId });
      if (!plan) {
        return null;
      }

      return parsePriorSnapshotFromStructure(plan.structure);
    },

    async persistInferredStateSnapshot(input) {
      const plan = await resolveTargetPlan({
        profileId: input.profileId,
        trainingPlanId: input.trainingPlanId,
      });

      if (!plan) {
        return;
      }

      const parsedStructure = parseTrainingPlanStructure(plan.structure) ?? {};
      const existingMetadata =
        parsedStructure.metadata &&
        typeof parsedStructure.metadata === "object" &&
        !Array.isArray(parsedStructure.metadata)
          ? (parsedStructure.metadata as Record<string, unknown>)
          : {};

      const nextStructure = {
        ...parsedStructure,
        metadata: {
          ...existingMetadata,
          inferred_state_snapshot: inferredStateSnapshotSchema.parse(input.inferredStateSnapshot),
        },
      };

      const { error } = await supabase
        .from("training_plans")
        .update({
          structure: nextStructure as Json,
        })
        .eq("id", plan.id)
        .eq("profile_id", input.profileId);

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }
    },
  };
}
