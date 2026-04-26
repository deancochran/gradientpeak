import { Button } from "@repo/ui/components/button";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare } from "lucide-react";
import { useState } from "react";

import { startDirectMessageAction } from "../../lib/social/server-actions";

export function MessageActionForm({
  redirectTo,
  targetUserId,
}: {
  redirectTo: string;
  targetUserId: string;
}) {
  const startDirectMessage = useServerFn(startDirectMessageAction);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    setIsPending(true);

    try {
      event.preventDefault();
      await startDirectMessage({ data: { redirectTo, target_user_id: targetUserId } });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form action={startDirectMessageAction.url} method="post" onSubmit={handleSubmit}>
      <input type="hidden" name="target_user_id" value={targetUserId} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <Button variant="outline" type="submit" disabled={isPending} className="w-32">
        <MessageSquare className="mr-2 h-4 w-4" />
        Message
      </Button>
    </form>
  );
}
