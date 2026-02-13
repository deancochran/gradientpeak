import { TRPCError } from "@trpc/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@repo/supabase";
import type {
  CreateTrainingPlanRecordInput,
  CreatedTrainingPlanRecord,
  TrainingPlanRepository,
} from "../../repositories";

export function createSupabaseTrainingPlanRepository(
  supabase: SupabaseClient<Database>,
): TrainingPlanRepository {
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
  };
}
