import { zodResolver } from "@hookform/resolvers/zod";
import {
  getConversationDisplayName,
  getConversationInitials,
  getConversationPreviewText,
} from "@repo/core/messaging";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@repo/ui/components/resizable";
import { ScrollArea } from "@repo/ui/components/scroll-area";
import { Separator } from "@repo/ui/components/separator";
import { cn } from "@repo/ui/lib/cn";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Send } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "../../components/providers/auth-provider";
import { RouteFlashToast, type RouteFlashType } from "../../components/route-flash-toast";
import { api } from "../../lib/api/client";
import { sendMessageAction } from "../../lib/messaging/server-actions";

const messageComposerSchema = z.object({
  content: z.string().trim().min(1, "Message is required"),
});

type MessageComposerValues = z.infer<typeof messageComposerSchema>;

export const Route = createFileRoute("/_protected/messages")({
  validateSearch: (search: Record<string, unknown>) => ({
    conversationId: typeof search.conversationId === "string" ? search.conversationId : undefined,
    flash: typeof search.flash === "string" ? search.flash : undefined,
    flashType:
      search.flashType === "success" || search.flashType === "error" || search.flashType === "info"
        ? (search.flashType as RouteFlashType)
        : undefined,
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const { user } = useAuth();
  const sendMessage = useServerFn(sendMessageAction);
  const navigate = Route.useNavigate();
  const { conversationId, flash, flashType } = Route.useSearch();
  const { data: conversations = [] } = api.messaging.getConversations.useQuery();
  const selectedId = conversationId ?? conversations[0]?.id ?? null;
  const form = useForm<MessageComposerValues>({
    resolver: zodResolver(messageComposerSchema),
    defaultValues: {
      content: "",
    },
  });

  useEffect(() => {
    form.reset({ content: "" });
  }, [form, selectedId]);

  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const { data: messages = [] } = api.messaging.getMessages.useQuery(
    { conversation_id: selectedId! },
    { enabled: Boolean(selectedId), refetchInterval: 5000 },
  );
  const handleSend = form.handleSubmit(async (values) => {
    if (!selectedId) {
      return;
    }

    await sendMessage({
      data: {
        content: values.content,
        conversation_id: selectedId,
        redirectTo: `/messages?conversationId=${selectedId}`,
      },
    });
  });

  return (
    <div className="h-[calc(100vh-8rem)] w-full overflow-hidden rounded-lg border bg-background">
      <RouteFlashToast
        message={flash}
        type={flashType}
        clear={() =>
          void navigate({
            to: "/messages",
            search: { conversationId, flash: undefined, flashType: undefined },
            replace: true,
          })
        }
      />
      <ResizablePanelGroup className="h-full w-full">
        <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
          <div className="flex h-full flex-col">
            <div className="p-4 font-semibold">Messages</div>
            <Separator />
            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-2 p-4">
                {conversations.map((conversation) => (
                  <Link
                    key={conversation.id}
                    to="/messages"
                    search={{
                      conversationId: conversation.id,
                      flash: undefined,
                      flashType: undefined,
                    }}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all hover:bg-accent",
                      selectedId === conversation.id && "bg-accent",
                    )}
                  >
                    <div className="flex w-full flex-col gap-1">
                      <div className="flex items-center">
                        <div className="flex items-center gap-2">
                          <div className="font-semibold">
                            {getConversationDisplayName(conversation)}
                          </div>
                        </div>
                        <div className="ml-auto text-xs text-muted-foreground">
                          {conversation.last_message_at
                            ? new Date(conversation.last_message_at).toLocaleDateString()
                            : ""}
                        </div>
                      </div>
                    </div>
                    <div className="line-clamp-2 text-xs text-muted-foreground">
                      {getConversationPreviewText(conversation)}
                    </div>
                  </Link>
                ))}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={75}>
          {selectedId && selectedConversation ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center border-b p-4">
                <div className="flex items-center gap-2">
                  <Avatar>
                    <AvatarFallback>{getConversationInitials(selectedConversation)}</AvatarFallback>
                  </Avatar>
                  <div className="font-semibold">
                    {getConversationDisplayName(selectedConversation)}
                  </div>
                </div>
              </div>
              <ScrollArea className="flex-1 p-4">
                <div className="flex flex-col gap-4">
                  {messages.map((message) => {
                    const isMe = message.sender_id === user?.id;
                    return (
                      <div
                        key={message.id}
                        className={cn(
                          "flex w-max max-w-[75%] flex-col gap-2 rounded-lg px-3 py-2 text-sm",
                          isMe ? "ml-auto bg-primary text-primary-foreground" : "bg-muted",
                        )}
                      >
                        {message.content}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              <div className="border-t p-4">
                <Form {...form}>
                  <form action={sendMessageAction.url} method="post" onSubmit={handleSend}>
                    <input type="hidden" name="conversation_id" value={selectedId ?? ""} />
                    <input
                      type="hidden"
                      name="redirectTo"
                      value={selectedId ? `/messages?conversationId=${selectedId}` : "/messages"}
                    />
                    <div className="flex items-center gap-2">
                      <FormField
                        control={form.control}
                        name="content"
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="Type a message..."
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    void handleSend();
                                  }
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        size="icon"
                        type="submit"
                        disabled={!selectedId || form.formState.isSubmitting}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Select a conversation to start chatting
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
