export function isNotFoundError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;

  if ("code" in error && error.code === "NOT_FOUND") return true;

  return (
    "data" in error &&
    typeof error.data === "object" &&
    error.data !== null &&
    "code" in error.data &&
    error.data.code === "NOT_FOUND"
  );
}
