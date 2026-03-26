const STALE_PREVIEW_MESSAGE_FRAGMENT = "Creation preview is stale or invalid";
const BLOCKING_CONFLICT_MESSAGE_FRAGMENT = "Creation blocked by unresolved conflicts";

type TrainingPlanCommitErrorCode =
  | "TRAINING_PLAN_COMMIT_STALE_PREVIEW"
  | "TRAINING_PLAN_COMMIT_CONFLICT"
  | "TRAINING_PLAN_COMMIT_INVALID_PAYLOAD"
  | "TRAINING_PLAN_COMMIT_NOT_FOUND";

type ErrorWithCauseCode = {
  data?: {
    cause?: {
      code?: string;
    };
  };
  message?: string;
};

function mapFromCauseCode(code: string | undefined): string | null {
  switch (code as TrainingPlanCommitErrorCode | undefined) {
    case "TRAINING_PLAN_COMMIT_STALE_PREVIEW":
      return "Preview is out of date. Refresh and review the latest projection before saving.";
    case "TRAINING_PLAN_COMMIT_CONFLICT":
      return "This plan has blocking conflicts. Resolve blockers in Review or allow override where supported.";
    case "TRAINING_PLAN_COMMIT_INVALID_PAYLOAD":
      return "Plan inputs are invalid. Review your settings and try saving again.";
    case "TRAINING_PLAN_COMMIT_NOT_FOUND":
      return "This plan is no longer available. Refresh your plans and try again.";
    default:
      return null;
  }
}

export function mapTrainingPlanSaveErrorMessage(error: unknown): string {
  return mapTrainingPlanSaveError(error).message;
}

export type TrainingPlanSaveErrorHandling = {
  message: string;
  action: "none" | "refresh_preview";
};

export function mapTrainingPlanSaveError(error: unknown): TrainingPlanSaveErrorHandling {
  if (error && typeof error === "object") {
    const typedError = error as ErrorWithCauseCode;
    const mappedByCause = mapFromCauseCode(typedError.data?.cause?.code);
    if (mappedByCause) {
      return {
        message: mappedByCause,
        action:
          typedError.data?.cause?.code === "TRAINING_PLAN_COMMIT_STALE_PREVIEW"
            ? "refresh_preview"
            : "none",
      };
    }
  }

  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Failed to save training plan from creation config.";

  if (rawMessage.includes(STALE_PREVIEW_MESSAGE_FRAGMENT)) {
    return {
      message: "Preview is out of date. Refresh and review the latest projection before saving.",
      action: "refresh_preview",
    };
  }

  if (rawMessage.includes(BLOCKING_CONFLICT_MESSAGE_FRAGMENT)) {
    return {
      message:
        "This plan has blocking conflicts. Resolve blockers in Review or allow override where supported.",
      action: "none",
    };
  }

  return {
    message: rawMessage,
    action: "none",
  };
}
