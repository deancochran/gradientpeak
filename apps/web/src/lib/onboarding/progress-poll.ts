import type { AppRouter, inferRouterOutputs } from "@repo/api/client";

type Progress = inferRouterOutputs<AppRouter>["onboarding"]["getProgress"];

export type ProgressPollResult<TReview> =
  | { kind: "progress"; progress: Progress }
  | { kind: "review"; progress: Progress; review: TReview }
  | { kind: "error"; message: string };

export async function pollOnboardingProgress<TReview>(input: {
  loadProgress: () => Promise<{ progress: Progress | null; error: string | null }>;
  loadReview: () => Promise<TReview>;
  shouldLoadReview: boolean;
}): Promise<ProgressPollResult<TReview>> {
  const result = await input.loadProgress();
  if (!result.progress) {
    return {
      kind: "error",
      message:
        result.error ??
        "Preparation progress could not be refreshed. Your work is still saved; try again.",
    };
  }

  if (result.progress.status === "review" && input.shouldLoadReview) {
    return { kind: "review", progress: result.progress, review: await input.loadReview() };
  }
  return { kind: "progress", progress: result.progress };
}
