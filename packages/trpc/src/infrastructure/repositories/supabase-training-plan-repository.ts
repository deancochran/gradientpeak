import { TRPCError } from "@trpc/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  inferredStateSnapshotSchema,
  type InferredStateSnapshot,
} from "@repo/core";
import type { Database, Json } from "@repo/supabase";
import type {
  CreateTrainingPlanRecordInput,
  CreatedTrainingPlanRecord,
  TrainingPlanRepository,
} from "../../repositories";

export function createSupabaseTrainingPlanRepository(
  supabase: SupabaseClient<Database>,
): TrainingPlanRepository {
  const parseTrainingPlanStructure = (
    value: unknown,
  ): Record<string, unknown> | null => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  };

  const parsePriorSnapshotFromStructure = (
    structure: unknown,
  ): InferredStateSnapshot | null => {
    const parsedStructure = parseTrainingPlanStructure(structure);
    if (!parsedStructure) {
      return null;
    }

    const metadata = parsedStructure.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return null;
    }

    const candidate = (metadata as Record<string, unknown>)
      .inferred_state_snapshot;
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

    const { data, error } = await supabase
      .from("training_plans")
      .select("id, structure")
      .eq("profile_id", input.profileId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error.message,
      });
    }

    return data?.[0] ? { id: data[0].id, structure: data[0].structure } : null;
  };

  return {
    async deactivateActivePlans(profileId: string) {
      const { error } = await supabase
        .from("training_plans")
        .update({ is_active: false })
        .eq("profile_id", profileId)
        .eq("is_active", true);

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }
    },

    async createTrainingPlan(
      input: CreateTrainingPlanRecordInput,
    ): Promise<CreatedTrainingPlanRecord> {
      const { data, error } = await supabase
        .from("training_plans")
        .insert({
          name: input.name,
          description: input.description,
          structure: input.structure as Json,
          is_active: input.isActive,
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
          inferred_state_snapshot: inferredStateSnapshotSchema.parse(
            input.inferredStateSnapshot,
          ),
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
