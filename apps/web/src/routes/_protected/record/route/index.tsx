import { createFileRoute, redirect } from "@tanstack/react-router";

import { validateRecordingSearch } from "../../../../lib/recording-web";

export const Route = createFileRoute("/_protected/record/route/")({
  validateSearch: (search: Record<string, unknown>) => validateRecordingSearch(search),
  beforeLoad: () => {
    throw redirect({ to: "/record", search: { activity_category: "run", gps: "off" } });
  },
  component: RecordRoutePage,
});

export function RecordRoutePage() {
  return null;
}
