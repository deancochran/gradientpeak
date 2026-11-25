type Publication = {
  publication?: { publishedRevision?: number | null } | null;
};

type ThresholdOverview<History> = Publication & {
  history: { items: History[]; nextCursor: unknown | null };
};

/**
 * History is only safe to combine with progress provenance when both reads
 * identify the same published athlete-state revision. Provenance remains
 * usable on its own because it is part of the progress response.
 */
export function selectPublishedGoalProgressHistory<History>(
  progress: Publication | undefined,
  overview: ThresholdOverview<History> | undefined,
) {
  const progressRevision = progress?.publication?.publishedRevision;
  const overviewRevision = overview?.publication?.publishedRevision;
  const matches =
    progressRevision !== null &&
    progressRevision !== undefined &&
    overviewRevision !== null &&
    overviewRevision !== undefined &&
    progressRevision === overviewRevision;
  const publicationMismatch =
    progressRevision !== null &&
    progressRevision !== undefined &&
    overviewRevision !== null &&
    overviewRevision !== undefined &&
    progressRevision !== overviewRevision;

  return {
    history: matches ? (overview?.history.items ?? []) : [],
    historyLimited: matches && overview?.history.nextCursor !== null,
    publicationMismatch,
  };
}
