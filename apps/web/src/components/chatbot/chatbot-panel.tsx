import { Button } from "@repo/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/ui/components/sheet";
import { Textarea } from "@repo/ui/components/textarea";
import { Bot, Send, Square } from "lucide-react";
import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";

import { useAuth } from "../providers/auth-provider";
import { useChatbot } from "./use-chatbot";

export function ChatbotLauncher() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user?.id) return null;
  // An account change must not carry a private, unsent draft into the next account's chat.
  return <ChatbotLauncherForActor key={user.id} actorId={user.id} open={open} setOpen={setOpen} />;
}

function ChatbotLauncherForActor({
  actorId,
  open,
  setOpen,
}: {
  actorId: string;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const { client, state, send } = useChatbot(actorId);
  const [draft, setDraft] = useState("");
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Assistant" title="Assistant">
          <Bot className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="h-dvh w-full gap-0 p-0 sm:w-[28rem] sm:max-w-none">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Assistant</SheetTitle>
          <SheetDescription>Ask about your training.</SheetDescription>
        </SheetHeader>
        <ChatbotConversation
          client={client}
          draft={draft}
          open={open}
          send={send}
          setDraft={setDraft}
          state={state}
        />
      </SheetContent>
    </Sheet>
  );
}

function ChatbotConversation({
  client,
  draft,
  state,
  send,
  setDraft,
  open,
}: {
  client: ReturnType<typeof useChatbot>["client"];
  draft: string;
  state: ReturnType<typeof useChatbot>["state"];
  send: ReturnType<typeof useChatbot>["send"];
  setDraft: Dispatch<SetStateAction<string>>;
  open: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const nearBottom = useRef(true);
  const [away, setAway] = useState(false);
  const previousContent = useRef("");

  useEffect(() => {
    if (open && state.threadId) void client.refresh();
    if (open) requestAnimationFrame(() => composer.current?.focus());
  }, [client, open, state.threadId]);
  useEffect(() => {
    const content = state.messages.map((message) => `${message.id}:${message.text}`).join("\n");
    const grew = content.length > previousContent.current.length;
    previousContent.current = content;
    if (grew && nearBottom.current)
      viewport.current?.scrollTo({ top: viewport.current.scrollHeight });
    if (grew && !nearBottom.current) setAway(true);
  }, [state.messages]);

  const submit = async () => {
    const submittedDraft = draft;
    const text = submittedDraft.trim();
    if (!text || text.length > 4000 || !state.canSend) return;
    await send(text, () => setDraft((current) => (current === submittedDraft ? "" : current)));
  };
  const status = statusText(state.status, state.error?.code);
  return (
    <section
      data-testid="chat-panel"
      className="flex min-h-0 flex-1 flex-col"
      aria-label="Assistant"
    >
      <p className="sr-only" aria-live="polite" data-testid="chat-status">
        {status}
      </p>
      {state.error ? (
        <p
          role="alert"
          className="mx-4 mt-3 rounded-md border border-destructive/30 px-3 py-2 text-sm"
        >
          {errorText(state.error.code, state.error.retryAfterSeconds)}
        </p>
      ) : null}
      <section
        ref={viewport}
        aria-label="Assistant conversation"
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-3"
        onScroll={(event) => {
          const element = event.currentTarget;
          nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
          if (nearBottom.current) setAway(false);
        }}
      >
        {state.messages.length === 0 ? (
          <p className="py-8 text-sm text-muted-foreground">Start a conversation.</p>
        ) : null}
        <div className="space-y-3">
          {state.messages.map((message) => (
            <article
              key={message.id}
              className={
                message.role === "user"
                  ? "ml-8 rounded-lg bg-primary p-3 text-primary-foreground"
                  : "mr-8 rounded-lg bg-muted p-3"
              }
            >
              <p className="text-xs font-medium opacity-75">
                {message.role === "user" ? "You" : "Assistant"}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>
            </article>
          ))}
          {state.activities.map((activity) => (
            <p key={activity.id} className="text-xs text-muted-foreground">
              {activity.label}: {activity.status}
            </p>
          ))}
        </div>
      </section>
      {away ? (
        <Button
          data-testid="chat-jump-to-latest"
          variant="secondary"
          size="sm"
          className="mx-auto"
          onClick={() => {
            viewport.current?.scrollTo({ top: viewport.current.scrollHeight });
            nearBottom.current = true;
            setAway(false);
          }}
        >
          Jump to latest
        </Button>
      ) : null}
      {state.pending ? (
        <div className="border-t px-4 py-2 text-sm text-muted-foreground">
          {state.canRecover
            ? "Request interrupted. Check its status or recover it before sending another message."
            : "Request pending. Check its status before sending another message."}
          <div className="mt-2 flex gap-2">
            <Button
              data-testid="chat-recovery"
              size="sm"
              variant="secondary"
              disabled={state.status === "streaming"}
              onClick={() => void (state.canRecover ? client.recover() : client.retryPending())}
            >
              {state.canRecover ? "Recover request" : "Check pending request"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={state.status === "streaming"}
              onClick={() => void client.refresh()}
            >
              Refresh status
            </Button>
          </div>
        </div>
      ) : null}
      <div className="border-t p-4">
        <label className="sr-only" htmlFor="chat-composer">
          Message assistant
        </label>
        <Textarea
          id="chat-composer"
          data-testid="chat-composer"
          ref={composer}
          value={draft}
          maxLength={4000}
          rows={3}
          disabled={!state.canSend}
          placeholder="Write a message"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{draft.length}/4000</span>
          <div className="flex gap-2">
            {state.status === "streaming" ? (
              <Button
                data-testid="chat-stop"
                type="button"
                variant="outline"
                onClick={() => client.stop()}
              >
                <Square /> Stop
              </Button>
            ) : null}
            <Button
              data-testid="chat-send"
              type="button"
              disabled={!state.canSend || !draft.trim() || draft.trim().length > 4000}
              onClick={() => void submit()}
            >
              <Send /> Send
            </Button>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={Boolean(state.pending)}
          onClick={() => void client.newConversation()}
        >
          New conversation
        </Button>
      </div>
    </section>
  );
}
function statusText(status: string, code?: string) {
  if (status === "streaming") return "Assistant is responding";
  if (status === "interrupted") return "Response interrupted";
  if (status === "unknown") return "Request status needs checking";
  if (status === "error") return `Assistant request failed${code ? `: ${code}` : ""}`;
  return "Assistant ready";
}
function errorText(code: string, retryAfterSeconds?: number) {
  const labels: Record<string, string> = {
    conflict: "Request needs recovery.",
    invalid_response: "Assistant returned an invalid response.",
    network: "Network connection failed.",
    persistence: "Unable to save this request locally.",
    rate_limited: "Assistant is temporarily rate limited.",
    unauthorized: "Your session has expired.",
    unavailable: "Assistant is temporarily unavailable.",
    update_client: "Please refresh to continue.",
  };
  return `${labels[code] ?? "Assistant request failed."}${retryAfterSeconds ? ` Try again in ${retryAfterSeconds}s.` : ""}`;
}
