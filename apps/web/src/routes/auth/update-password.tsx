import { createFileRoute } from "@tanstack/react-router";

import { UpdatePasswordForm } from "../../components/update-password-form";

export const Route = createFileRoute("/auth/update-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: UpdatePasswordPage,
});

function UpdatePasswordPage() {
  const { token } = Route.useSearch();

  return (
    <div className="flex min-h-[70vh] items-center justify-center py-6 md:py-10">
      <div className="w-full max-w-sm">
        <UpdatePasswordForm token={token} />
      </div>
    </div>
  );
}
