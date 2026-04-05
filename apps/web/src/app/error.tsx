"use client";

import { Button } from "@repo/ui/components/button";
import { RouteFeedback } from "@/app/_components/route-feedback";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteFeedback
      title="Something went wrong"
      description="We hit an unexpected error while loading this route. Please try again."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
