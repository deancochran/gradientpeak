export function getStartProcessingStatusMessage(status: "processing" | "review") {
  return status === "review"
    ? {
        title: "Ready to review",
        description: "No provider work is pending. Review your setup and finish onboarding.",
      }
    : {
        title: "Processing started",
        description: "Provider evidence is processing. Progress will refresh automatically.",
      };
}
