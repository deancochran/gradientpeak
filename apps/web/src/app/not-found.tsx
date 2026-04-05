import { Button } from "@repo/ui/components/button";
import Link from "next/link";
import { RouteFeedback } from "@/app/_components/route-feedback";

export default function NotFound() {
  return (
    <RouteFeedback
      title="Page not found"
      description="The page you requested does not exist or is no longer available."
      action={
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/auth/login">Go to login</Link>
          </Button>
          <Button asChild>
            <Link href="/">Go to dashboard</Link>
          </Button>
        </div>
      }
    />
  );
}
