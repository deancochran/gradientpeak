import type { ErrorMessageProps, ErrorStateCardProps } from "./shared";

export const errorStateCardFixtures = {
  generic: {
    title: "Something went wrong",
    message: "An unexpected error occurred. Please try again.",
    retryLabel: "Try Again",
    iconSize: 48,
    iconColor: "text-destructive",
    showRetryButton: true,
  } satisfies ErrorStateCardProps,
  inline: {
    message: "Unable to load this section.",
    retryLabel: "Retry",
  } satisfies ErrorMessageProps,
};
