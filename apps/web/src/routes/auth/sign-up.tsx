import { createFileRoute } from "@tanstack/react-router";

import { SignUpForm } from "../../components/sign-up-form";
import { useRedirectIfAuthenticated } from "../../components/providers/auth-provider";

export const Route = createFileRoute("/auth/sign-up")({
  component: SignUpPage,
});

function SignUpPage() {
  const { isLoading } = useRedirectIfAuthenticated("/");

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Checking session...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center py-6 md:py-10">
      <div className="w-full max-w-sm">
        <SignUpForm />
      </div>
    </div>
  );
}
