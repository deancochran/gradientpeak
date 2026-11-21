import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader } from "@repo/ui/components/card";
import { Link } from "@tanstack/react-router";
import { ShieldX } from "lucide-react";

export function CoachAccessDenied() {
  return (
    <section
      aria-labelledby="coach-access-denied-heading"
      className="flex items-center justify-center p-6 text-foreground"
    >
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
            <ShieldX className="h-5 w-5 text-muted-foreground" />
          </div>
          <h1
            id="coach-access-denied-heading"
            className="font-semibold leading-none tracking-tight"
          >
            Organization access unavailable
          </h1>
          <CardDescription>
            This organization is not available for this coaching session. Its access may have ended;
            your Personal athlete records are not deleted.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/organizations">Choose an organization</Link>
          </Button>
          <Button asChild variant="outline" className="bg-transparent">
            <Link to="/">Return to Personal workspace</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
