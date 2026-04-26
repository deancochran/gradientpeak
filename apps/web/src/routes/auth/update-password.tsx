import { createFileRoute } from "@tanstack/react-router";

import { RouteFlashToast, type RouteFlashType } from "../../components/route-flash-toast";
import { UpdatePasswordForm } from "../../components/update-password-form";

export const Route = createFileRoute("/auth/update-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    flash: typeof search.flash === "string" ? search.flash : undefined,
    flashType:
      search.flashType === "success" || search.flashType === "error" || search.flashType === "info"
        ? (search.flashType as RouteFlashType)
        : undefined,
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: UpdatePasswordPage,
});

function UpdatePasswordPage() {
  const navigate = Route.useNavigate();
  const { flash, flashType, token } = Route.useSearch();

  return (
    <div className="flex min-h-[70vh] items-center justify-center py-6 md:py-10">
      <RouteFlashToast
        message={flash}
        type={flashType}
        clear={() =>
          void navigate({
            to: "/auth/update-password",
            search: { flash: undefined, flashType: undefined, token },
            replace: true,
          })
        }
      />
      <div className="w-full max-w-sm">
        <UpdatePasswordForm token={token} />
      </div>
    </div>
  );
}
