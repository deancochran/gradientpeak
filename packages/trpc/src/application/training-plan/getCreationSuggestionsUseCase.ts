import {
  deriveCreationSuggestions,
  getCreationSuggestionsInputSchema,
  type CreationContextSummary,
} from "@repo/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

type GetCreationSuggestionsInput = z.infer<
  typeof getCreationSuggestionsInputSchema
>;

type DeriveProfileAwareCreationContext = (input: {
  supabase: SupabaseClient;
  profileId: string;
  asOfIso?: string;
}) => Promise<{ contextSummary: CreationContextSummary }>;

export async function getCreationSuggestionsUseCase(input: {
  supabase: SupabaseClient;
  profileId: string;
  params: GetCreationSuggestionsInput;
  deriveProfileAwareCreationContext: DeriveProfileAwareCreationContext;
  nowIso?: string;
}) {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const { contextSummary } = await input.deriveProfileAwareCreationContext({
    supabase: input.supabase,
    profileId: input.profileId,
    asOfIso: input.params?.as_of,
  });

  const suggestions = deriveCreationSuggestions({
    context: contextSummary,
    existing_values: input.params?.existing_values,
    locks: input.params?.locks,
    now_iso: nowIso,
  });

  return {
    context_summary: contextSummary,
    suggestions,
  };
}
