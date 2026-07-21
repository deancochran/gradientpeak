import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader } from "@repo/ui/components/card";
import { Link } from "@tanstack/react-router";
import { ShieldX } from "lucide-react";

export function CoachAccessDenied() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-50">
      <Card className="w-full max-w-lg border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-800">
            <ShieldX className="h-5 w-5 text-slate-300" />
          </div>
          <h1 className="font-semibold leading-none tracking-tight">Coaching access required</h1>
          <CardDescription className="text-slate-400">
            Your authenticated profile does not have an active coaching role in this organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            asChild
            variant="outline"
            className="border-slate-700 bg-transparent text-slate-100"
          >
            <Link to="/">Return to the standard app</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
