import { createFileRoute } from "@tanstack/react-router";
import { LoginForm } from "../../components/login-form";
import { RouteFlashToast, type RouteFlashType } from "../../components/route-flash-toast";
import { getSafeAppRedirectTarget } from "../../lib/app-url";
import { publicAuthPageMiddleware, redirectAuthenticatedUser } from "../../lib/auth/route-guards";

export const Route = createFileRoute("/auth/login")({
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
  component: LoginPage,
});

function LoginPage() {
  const navigate = Route.useNavigate();
  const { flash, flashType, redirect } = Route.useSearch();

  return (
    <div className="flex min-h-[70vh] items-center justify-center py-6 md:py-10">
      <RouteFlashToast
        message={flash}
        type={flashType}
        clear={() =>
          void navigate({
            to: "/auth/login",
            search: { flash: undefined, flashType: undefined, redirect },
            replace: true,
          })
        }
      />
      <div className="w-full max-w-sm">
        <LoginForm redirectTo={redirect} />
      </div>
    </div>
  );
}
