// Error tracking service for centralized logging and monitoring
export const logError = (error: Error, context?: string) => {
  const errorMessage = `${context ? `[${context}] ` : ""}${error.message}`;
  const timestamp = new Date().toISOString();

  if (__DEV__) {
    console.error("🚨 Error:", errorMessage);
    console.error("Time:", timestamp);
    console.error("Stack:", error.stack);
  } else {
    // In production, send to your error tracking service
    // Examples:
    // Sentry.captureException(error, { tags: { context, timestamp } });
    // crashlytics().recordError(error);
    // Bugsnag.notify(error);
    console.error("Production Error:", errorMessage, timestamp);
  }
};
