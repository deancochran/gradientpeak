/**
 * Keep an already-renderable route cache entry visible while it revalidates.
 * Cold loads still reject so the route's existing error boundary can render.
 */
export async function loadRouteQuery<T>(
  getCached: () => T | undefined,
  fetch: () => Promise<T>,
): Promise<void> {
  if (getCached() !== undefined) {
    void fetch().catch(() => undefined);
    return;
  }

  try {
    await fetch();
  } catch (error) {
    if (isTrpcNotFound(error)) throw notFound();
    throw error;
  }
}

function isTrpcNotFound(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "object" &&
    error.data !== null &&
    "code" in error.data &&
    error.data.code === "NOT_FOUND"
  );
}

import { notFound } from "@tanstack/react-router";
