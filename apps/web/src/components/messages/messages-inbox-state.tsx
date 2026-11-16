import { Button } from "@repo/ui/components/button";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";

type MessageSearch = {
  compose: true;
  composeGroup: undefined;
  composeQuery: undefined;
  composeRecipients: [];
  conversationId: undefined;
  flash: undefined;
  flashType: undefined;
};

const composeSearch: MessageSearch = {
  compose: true,
  composeGroup: undefined,
  composeQuery: undefined,
  composeRecipients: [],
  conversationId: undefined,
  flash: undefined,
  flashType: undefined,
};

export function MessagesInboxErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center"
      role="alert"
    >
      <div>
        <h2 className="font-semibold">Conversations could not be loaded</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your inbox is unchanged. Try loading it again.
        </p>
      </div>
      <Button onClick={onRetry} type="button" variant="outline">
        Retry inbox
      </Button>
    </div>
  );
}

export function MessagesEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center text-muted-foreground">
      <div>
        <h2 className="font-semibold text-foreground">No conversations yet</h2>
        <p className="mt-1 text-sm">Start a message when you are ready to connect with someone.</p>
      </div>
      <Button asChild>
        <Link to="/messages" search={composeSearch}>
          <Plus className="mr-2 h-4 w-4" />
          New message
        </Link>
      </Button>
    </div>
  );
}
