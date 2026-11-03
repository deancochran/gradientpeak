import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/sign-up-success")({
  validateSearch: (search: Record<string, unknown>) => ({
    email: typeof search.email === "string" ? search.email : undefined,
    source: typeof search.source === "string" ? search.source : undefined,
  }),
  beforeLoad: ({ search }) => {
    const { email, source } = search as { email?: string; source?: string };
    throw redirect({
      to: "/auth/verify",
      search: {
        email,
        flash: undefined,
        flashType: undefined,
        source: source ?? "sign-up",
      },
    });
  },
});
