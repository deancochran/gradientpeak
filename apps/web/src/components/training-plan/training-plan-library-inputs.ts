export function getOwnedTrainingPlansInput(search: string) {
  return {
    ownerScope: "own" as const,
    search: search.trim() || undefined,
    limit: 25,
  };
}

export function getTemplateTrainingPlansInput(search: string) {
  return { search: search.trim() || undefined, limit: 25 };
}
