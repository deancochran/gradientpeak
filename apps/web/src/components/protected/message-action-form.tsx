import { LoadingButton } from "@repo/ui/components/loading";
import { useNavigate } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";

import { api } from "../../lib/api/client";
import { contractEpochFormInputProps } from "../../lib/contract-epoch";
import { startDirectMessageAction } from "../../lib/social/server-actions";

export function MessageActionForm({
  redirectTo,
  targetUserId,
}: {
  redirectTo: string;
  targetUserId: string;
}) {
  const navigate = useNavigate();
  const startDirectMessage = api.messaging.getOrCreateDM.useMutation();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const conversation = await startDirectMessage.mutateAsync({
        target_user_id: targetUserId,
      });
      await navigate({
        to: "/messages",
        search: {
          compose: false,
          composeGroup: undefined,
          composeQuery: undefined,
          composeRecipients: [],
          conversationId: conversation.id,
          flash: "Conversation ready",
          flashType: "success",
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to start conversation");
    }
  };

  return (
    <form action={startDirectMessageAction.url} method="post" onSubmit={handleSubmit}>
      <input {...contractEpochFormInputProps} />
      <input type="hidden" name="target_user_id" value={targetUserId} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <LoadingButton
        variant="outline"
        type="submit"
        disabled={startDirectMessage.isPending}
        loading={startDirectMessage.isPending}
        loadingLabel="Opening..."
        className="w-32"
      >
        <MessageSquare className="mr-2 h-4 w-4" />
        Message
      </LoadingButton>
    </form>
  );
}
