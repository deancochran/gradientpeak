import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/error")({
  validateSearch: (search: Record<string, unknown>) => ({
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: AuthErrorPage,
});

function AuthErrorPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center py-6 md:py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Sorry, something went wrong.</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                We could not complete that sign-in request. Please try again.
              </p>
              <Button asChild className="w-full">
                <Link
                  to="/auth/login"
                  search={{ flash: undefined, flashType: undefined, redirect: undefined }}
                >
                  Back to Sign In
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
