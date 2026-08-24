import { createFileRoute, redirect } from "@tanstack/react-router";

import { validateRecordingSearch } from "../../../../lib/recording-web";

export const Route = createFileRoute("/_protected/record/route-preview/$routeId")({
  validateSearch: (search: Record<string, unknown>) => validateRecordingSearch(search),
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/record",
      search: { activity_category: "run", gps: "off", routeId: params.routeId },
    });
  },
  component: RecordRoutePreviewPage,
});

export function RecordRoutePreviewPage() {
  return null;
}
