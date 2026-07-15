import { canonicalSportSchema } from "@repo/core/schemas/sport";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { type RecordingLauncherSearch, validateRecordingSearch } from "../../../lib/recording-web";

export type RecordSubmitSearch = RecordingLauncherSearch & {
  activityType: "run" | "bike" | "swim" | "strength" | "other";
};

export function validateRecordSubmitSearch(search: Record<string, unknown>): RecordSubmitSearch {
  const activityTypeResult = canonicalSportSchema.safeParse(search.activityType);
  const recordingSearch = validateRecordingSearch({
    ...search,
    category: activityTypeResult.success ? activityTypeResult.data : search.category,
  });

  return {
    ...recordingSearch,
    activityType: activityTypeResult.success ? activityTypeResult.data : recordingSearch.category,
  };
}

export const Route = createFileRoute("/_protected/record/submit")({
  component: RecordSubmitRedirect,
  validateSearch: validateRecordSubmitSearch,
});

export function RecordSubmitRedirect() {
  const search = Route.useSearch();

  return <Navigate replace search={{ ...search, from: "record" }} to="/activities/import" />;
}
