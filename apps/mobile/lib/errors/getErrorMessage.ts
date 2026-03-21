export function getErrorMessage(error: unknown): string {
  if (!error) return "An unexpected error occurred";

  if (typeof error === "string") return error;

  if (error instanceof Error) {
    if (error.message.includes("Network") || error.message.includes("fetch")) {
      return "Unable to connect. Please check your internet connection.";
    }

    if (error.message.includes("timeout")) {
      return "Request timed out. Please try again.";
    }

    if (error.message.includes("permission") || error.message.includes("unauthorized")) {
      return "You don't have permission to access this resource.";
    }

    if (error.message.includes("not found") || error.message.includes("404")) {
      return "The requested resource was not found.";
    }

    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const err = error as any;

    if (err.data?.code === "UNAUTHORIZED") return "Please sign in to continue.";
    if (err.data?.code === "FORBIDDEN") {
      return "You don't have permission to perform this action.";
    }
    if (err.data?.code === "NOT_FOUND") return "The requested resource was not found.";
    if (err.data?.code === "TOO_MANY_REQUESTS") {
      return "Too many requests. Please wait a moment and try again.";
    }
    if (err.message) return err.message;
  }

  return "An unexpected error occurred. Please try again.";
}
