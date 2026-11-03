import { createFileRoute, redirect } from "@tanstack/react-router";

import { validateRecordingSearch } from "../../../../lib/recording-web";

export const Route = createFileRoute("/_protected/record/route/")({
  validateSearch: (search: Record<string, unknown>) => validateRecordingSearch(search),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/record/session", search });
  },
  component: RecordRoutePage,
});

export function RecordRoutePage() {
  return null;
}
