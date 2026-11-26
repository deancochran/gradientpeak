import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateRecordingSearch } from "../../../lib/recording-web";

/** Legacy entrypoint: recording always starts on the durable session surface. */
export const Route = createFileRoute("/_protected/record/")({
  validateSearch: (search: Record<string, unknown>) => validateRecordingSearch(search),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/record/session", search });
  },
  component: () => null,
});
