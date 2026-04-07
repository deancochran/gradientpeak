import {
  type CreationContextSummary,
  deriveCreationSuggestions,
  getCreationSuggestionsInputSchema,
} from "@repo/core";
import { z } from "zod";

type GetCreationSuggestionsInput = z.infer<typeof getCreationSuggestionsInputSchema>;

type DeriveProfileAwareCreationContext<TCreationContextReader> = (input: {
  creationContextReader: TCreationContextReader;
  profileId: string;
  asOfIso?: string;
}) => Promise<{ contextSummary: CreationContextSummary }>;

export async function getCreationSuggestionsUseCase<TCreationContextReader>(input: {
  creationContextReader: TCreationContextReader;
  profileId: string;
  params: GetCreationSuggestionsInput;
  deriveProfileAwareCreationContext: DeriveProfileAwareCreationContext<TCreationContextReader>;
  nowIso?: string;
}) {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const { contextSummary } = await input.deriveProfileAwareCreationContext({
    creationContextReader: input.creationContextReader,
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
