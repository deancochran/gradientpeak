import { createFileRoute } from "@tanstack/react-router";

import { RouteFlashToast, type RouteFlashType } from "../../components/route-flash-toast";
import { SignUpForm } from "../../components/sign-up-form";
import { getSafeAppRedirectTarget } from "../../lib/app-url";
import { publicAuthPageMiddleware, redirectAuthenticatedUser } from "../../lib/auth/route-guards";

export const Route = createFileRoute("/auth/sign-up")({
  validateSearch: (search: Record<string, unknown>) => ({
    flash: typeof search.flash === "string" ? search.flash : undefined,
    flashType:
      search.flashType === "success" || search.flashType === "error" || search.flashType === "info"
        ? (search.flashType as RouteFlashType)
        : undefined,
    redirect:
      typeof search.redirect === "string"
        ? getSafeAppRedirectTarget(search.redirect, "/")
        : undefined,
  }),
  server: {
    middleware: publicAuthPageMiddleware,
  },
  beforeLoad: async ({ serverContext }) => {
    await redirectAuthenticatedUser(serverContext);
  },
  component: SignUpPage,
});

function SignUpPage() {
  const navigate = Route.useNavigate();
  const { flash, flashType, redirect } = Route.useSearch();

  return (
    <div className="flex min-h-[70vh] items-center justify-center py-6 md:py-10">
      <RouteFlashToast
        {...(flash === undefined ? {} : { message: flash })}
        {...(flashType === undefined ? {} : { type: flashType })}
        clear={() =>
          void navigate({
            to: "/auth/sign-up",
            search: { flash: undefined, flashType: undefined, redirect },
            replace: true,
          })
        }
      />
      <div className="w-full max-w-sm">
        <SignUpForm {...(redirect === undefined ? {} : { redirectTo: redirect })} />
      </div>
    </div>
  );
}
