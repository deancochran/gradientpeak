import { createFileRoute } from "@tanstack/react-router";
import { ForgotPasswordForm } from "../../components/forgot-password-form";
import { RouteFlashToast, type RouteFlashType } from "../../components/route-flash-toast";
import { publicAuthPageMiddleware, redirectAuthenticatedUser } from "../../lib/auth/route-guards";

export const Route = createFileRoute("/auth/forgot-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    flash: typeof search.flash === "string" ? search.flash : undefined,
    flashType:
      search.flashType === "success" || search.flashType === "error" || search.flashType === "info"
        ? (search.flashType as RouteFlashType)
        : undefined,
  }),
  server: {
    middleware: publicAuthPageMiddleware,
  },
  beforeLoad: async ({ serverContext }) => {
    await redirectAuthenticatedUser(serverContext);
  },
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const navigate = Route.useNavigate();
  const { flash, flashType } = Route.useSearch();

  return (
    <div className="flex min-h-[70vh] items-center justify-center py-6 md:py-10">
      <RouteFlashToast
        message={flash}
        type={flashType}
        clear={() =>
          void navigate({
            to: "/auth/forgot-password",
            search: { flash: undefined, flashType: undefined },
            replace: true,
          })
        }
      />
      <div className="w-full max-w-sm">
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
