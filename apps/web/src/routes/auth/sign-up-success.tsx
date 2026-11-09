import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSafeAppRedirectTarget } from "../../lib/app-url";

export const Route = createFileRoute("/auth/sign-up-success")({
  validateSearch: (search: Record<string, unknown>) => ({
    email: typeof search.email === "string" ? search.email : undefined,
    source: typeof search.source === "string" ? search.source : undefined,
    redirect:
      typeof search.redirect === "string"
        ? getSafeAppRedirectTarget(search.redirect, "/")
        : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/auth/verify",
      search: {
        email: search.email,
        flash: undefined,
        flashType: undefined,
        source: search.source ?? "sign-up",
        redirect: search.redirect,
      },
    });
  },
});
