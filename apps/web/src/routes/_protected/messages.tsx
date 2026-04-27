import { zodResolver } from "@hookform/resolvers/zod";
import { invalidateConversationQueries, invalidateMessagingInboxQueries } from "@repo/api/react";
import {
  getConversationDisplayName,
  getConversationInitials,
  getConversationPreviewText,
} from "@repo/core/messaging";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { ScrollArea } from "@repo/ui/components/scroll-area";
import { Separator } from "@repo/ui/components/separator";
import { cn } from "@repo/ui/lib/cn";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Search, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { useAuth } from "../../components/providers/auth-provider";
import { RouteFlashToast, type RouteFlashType } from "../../components/route-flash-toast";
import { api } from "../../lib/api/client";
import { sendMessageAction } from "../../lib/messaging/server-actions";

const messageComposerSchema = z.object({
  content: z.string().trim().min(1, "Message is required"),
});

type MessageComposerValues = z.infer<typeof messageComposerSchema>;

type ComposeRecipient = {
  avatar_url?: string | null;
  id: string;
  is_public: boolean | null;
  username: string | null;
};

function parseComposeRecipients(value: unknown): ComposeRecipient[] {
  if (Array.isArray(value)) {
    return value
      .filter((recipient) => typeof recipient?.id === "string")
      .map((recipient) => ({
        avatar_url: typeof recipient.avatar_url === "string" ? recipient.avatar_url : null,
        id: recipient.id,
        is_public: typeof recipient.is_public === "boolean" ? recipient.is_public : null,
        username: typeof recipient.username === "string" ? recipient.username : null,
      }));
  }

  if (typeof value !== "string" || value.length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as Array<
      Pick<ComposeRecipient, "id" | "is_public" | "username">
    >;
    return parsed
      .filter((recipient) => typeof recipient?.id === "string")
      .map((recipient) => ({
        id: recipient.id,
        is_public: typeof recipient.is_public === "boolean" ? recipient.is_public : null,
        username: typeof recipient.username === "string" ? recipient.username : null,
        avatar_url: null,
      }));
  } catch {
    return [];
  }
}

function serializeComposeRecipients(recipients: ComposeRecipient[]) {
  if (recipients.length === 0) {
    return undefined;
  }

  return JSON.stringify(
    recipients.map((recipient) => ({
      id: recipient.id,
      is_public: recipient.is_public,
      username: recipient.username,
    })),
  );
}

export const Route = createFileRoute("/_protected/messages")({
  validateSearch: (search: Record<string, unknown>) => ({
    compose: search.compose === "true",
    composeGroup: typeof search.composeGroup === "string" ? search.composeGroup : undefined,
    composeQuery: typeof search.composeQuery === "string" ? search.composeQuery : undefined,
    composeRecipients: parseComposeRecipients(search.composeRecipients),
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
  const utils = api.useUtils();
  const sendMessage = useServerFn(sendMessageAction);
  const navigate = Route.useNavigate();
  const {
    compose,
    composeGroup,
    composeQuery,
    composeRecipients,
    conversationId,
    flash,
    flashType,
  } = Route.useSearch();
  const { data: conversations = [] } = api.messaging.getConversations.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const selectedConversation = compose
    ? null
    : (conversations.find((conversation) => conversation.id === conversationId) ??
      conversations[0] ??
      null);
  const selectedId = selectedConversation?.id ?? null;
  const { data: messages = [] } = api.messaging.getMessages.useQuery(
    { conversation_id: selectedId! },
    { enabled: Boolean(selectedId), refetchInterval: 5000 },
  );
  const trimmedComposeQuery = composeQuery?.trim() ?? "";
  const { data: searchedUsers, isLoading: searchUsersLoading } = api.social.searchUsers.useQuery(
    {
      query: trimmedComposeQuery || undefined,
      limit: 20,
    },
    { enabled: compose },
  );
  const markAsReadMutation = api.messaging.markAsRead.useMutation({
    onSettled: async () => invalidateMessagingInboxQueries(utils),
  });
  const getOrCreateDMMutation = api.messaging.getOrCreateDM.useMutation();
  const createConversationMutation = api.messaging.createConversation.useMutation();
  const [selectedRecipients, setSelectedRecipients] =
    useState<ComposeRecipient[]>(composeRecipients);
  const [groupName, setGroupName] = useState(composeGroup ?? "");
  const [composeError, setComposeError] = useState<string | null>(null);
  const lastMarkedConversationRef = useRef<string | null>(null);
  const form = useForm<MessageComposerValues>({
    resolver: zodResolver(messageComposerSchema),
    defaultValues: {
      content: "",
    },
  });

  useEffect(() => {
    form.reset({ content: "" });
  }, [form, selectedId]);

  useEffect(() => {
    if (!selectedId || !selectedConversation || messages.length === 0) {
      return;
    }

    if (selectedConversation.unread_count <= 0) {
      return;
    }

    const unreadSignature = `${selectedId}:${selectedConversation.unread_count}`;
    if (lastMarkedConversationRef.current === unreadSignature) {
      return;
    }

    markAsReadMutation.mutate(
      { conversation_id: selectedId },
      {
        onSuccess: () => {
          lastMarkedConversationRef.current = unreadSignature;
        },
      },
    );
  }, [markAsReadMutation, messages.length, selectedConversation, selectedId]);

  useEffect(() => {
    setSelectedRecipients(composeRecipients);
  }, [composeRecipients]);

  useEffect(() => {
    setGroupName(composeGroup ?? "");
  }, [composeGroup]);

  const handleSend = form.handleSubmit(async (values) => {
    if (!selectedId) {
      return;
    }

    try {
      await sendMessage({
        data: {
          content: values.content,
          conversation_id: selectedId,
          redirectTo: `/messages?conversationId=${selectedId}`,
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send message");
    }
  });

  const visibleUsers = (searchedUsers?.users ?? []).filter(
    (candidate) => !selectedRecipients.some((recipient) => recipient.id === candidate.id),
  );
  const isCreatingConversation =
    getOrCreateDMMutation.isPending || createConversationMutation.isPending;

  const updateComposeSearch = (
    updates: Partial<{ composeGroup: string | undefined; composeRecipients: ComposeRecipient[] }>,
  ) => {
    void navigate({
      to: "/messages",
      search: {
        compose: true,
        composeGroup: updates.composeGroup ?? (groupName || undefined),
        composeQuery,
        composeRecipients: updates.composeRecipients ?? selectedRecipients,
        conversationId: undefined,
        flash: undefined,
        flashType: undefined,
      },
      replace: true,
    });
  };

  const toggleRecipient = (recipient: ComposeRecipient) => {
    setComposeError(null);
    setSelectedRecipients((current) => {
      const isSelected = current.some((entry) => entry.id === recipient.id);
      const nextRecipients = isSelected
        ? current.filter((entry) => entry.id !== recipient.id)
        : [...current, recipient];

      updateComposeSearch({ composeRecipients: nextRecipients });
      return nextRecipients;
    });
  };

  const openConversation = async (id: string, successMessage: string) => {
    await Promise.all([
      invalidateMessagingInboxQueries(utils),
      invalidateConversationQueries(utils, id),
    ]);

    await navigate({
      to: "/messages",
      search: {
        compose: false,
        composeGroup: undefined,
        composeQuery: undefined,
        composeRecipients: [],
        conversationId: id,
        flash: successMessage,
        flashType: "success",
      },
    });
  };

  const handleCreateConversation = async () => {
    if (selectedRecipients.length === 0) {
      setComposeError("Select at least one recipient.");
      return;
    }

    setComposeError(null);

    try {
      if (selectedRecipients.length === 1) {
        const targetRecipient = selectedRecipients[0];
        if (!targetRecipient) {
          setComposeError("Select at least one recipient.");
          return;
        }

        const conversation = await getOrCreateDMMutation.mutateAsync({
          target_user_id: targetRecipient.id,
        });

        await openConversation(conversation.id, "Conversation ready");
        return;
      }

      const conversation = await createConversationMutation.mutateAsync({
        participant_ids: selectedRecipients.map((recipient) => recipient.id),
        group_name: groupName.trim() || undefined,
      });

      await openConversation(conversation.id, "Conversation created");
    } catch (error) {
      setComposeError(error instanceof Error ? error.message : "Failed to create conversation");
      toast.error(error instanceof Error ? error.message : "Failed to create conversation");
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)] w-full overflow-hidden rounded-lg border bg-background">
      <RouteFlashToast
        message={flash}
        type={flashType}
        clear={() =>
          void navigate({
            to: "/messages",
            search: {
              compose,
              composeGroup,
              composeQuery,
              composeRecipients,
              conversationId,
              flash: undefined,
              flashType: undefined,
            },
            replace: true,
          })
        }
      />
      <div className="flex h-full w-full">
        <div className="hidden h-full w-[28%] min-w-[18rem] max-w-[28rem] shrink-0 border-r xl:block">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-3 p-4">
              <div>
                <div className="font-semibold">Messages</div>
                <div className="text-xs text-muted-foreground">
                  {conversations.length}{" "}
                  {conversations.length === 1 ? "conversation" : "conversations"}
                </div>
              </div>
              <Button asChild size="sm" variant={compose ? "default" : "outline"}>
                <Link
                  to="/messages"
                  search={{
                    compose: true,
                    composeGroup: undefined,
                    composeQuery: undefined,
                    composeRecipients: [],
                    conversationId: undefined,
                    flash: undefined,
                    flashType: undefined,
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New
                </Link>
              </Button>
            </div>
            <Separator />
            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-2 p-4">
                {conversations.map((conversation) => {
                  const unreadCount = conversation.unread_count ?? 0;

                  return (
                    <Link
                      key={conversation.id}
                      to="/messages"
                      search={{
                        compose: false,
                        composeGroup: undefined,
                        composeQuery: undefined,
                        composeRecipients: [],
                        conversationId: conversation.id,
                        flash: undefined,
                        flashType: undefined,
                      }}
                      className={cn(
                        "flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all hover:bg-accent",
                        selectedId === conversation.id && "bg-accent",
                      )}
                    >
                      <div className="flex w-full items-start gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage
                            src={conversation.peer_profile?.avatar_url || ""}
                            alt={getConversationDisplayName(conversation)}
                          />
                          <AvatarFallback>{getConversationInitials(conversation)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                "truncate font-medium",
                                unreadCount > 0 && "font-semibold",
                              )}
                            >
                              {getConversationDisplayName(conversation)}
                            </div>
                            {unreadCount > 0 ? (
                              <Badge className="h-5 min-w-5 justify-center px-1.5">
                                {unreadCount > 9 ? "9+" : unreadCount}
                              </Badge>
                            ) : null}
                            <div className="ml-auto shrink-0 text-xs text-muted-foreground">
                              {conversation.last_message_at
                                ? new Date(conversation.last_message_at).toLocaleDateString()
                                : ""}
                            </div>
                          </div>
                          <div
                            className={cn(
                              "line-clamp-2 text-xs text-muted-foreground",
                              unreadCount > 0 && "text-foreground",
                            )}
                          >
                            {getConversationPreviewText(conversation)}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
                {conversations.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No conversations yet. Start a new message to create one.
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </div>
        </div>
        <div className="flex-1">
          {!compose && conversations.length > 1 ? (
            <div className="border-b p-3 xl:hidden">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Conversations
              </div>
              <ScrollArea className="w-full whitespace-nowrap">
                <div className="flex gap-2">
                  {conversations.map((conversation) => (
                    <Link
                      key={`mobile-${conversation.id}`}
                      to="/messages"
                      search={{
                        compose: false,
                        composeGroup: undefined,
                        composeQuery: undefined,
                        composeRecipients: [],
                        conversationId: conversation.id,
                        flash: undefined,
                        flashType: undefined,
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm transition-colors hover:bg-accent",
                        selectedId === conversation.id && "bg-accent",
                      )}
                    >
                      {getConversationDisplayName(conversation)}
                    </Link>
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : null}
          {compose ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b p-4">
                <div>
                  <div className="font-semibold">New message</div>
                  <div className="text-sm text-muted-foreground">
                    Search for athletes, coaches, or friends and start a conversation.
                  </div>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link
                    to="/messages"
                    search={{
                      compose: false,
                      composeGroup: undefined,
                      composeQuery: undefined,
                      composeRecipients: [],
                      conversationId: conversationId ?? conversations[0]?.id,
                      flash: undefined,
                      flashType: undefined,
                    }}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Close
                  </Link>
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="space-y-6 p-4">
                  <form method="get" action="/messages" className="flex gap-2">
                    <input type="hidden" name="compose" value="true" />
                    <input type="hidden" name="composeGroup" value={groupName} />
                    <input
                      type="hidden"
                      name="composeRecipients"
                      value={serializeComposeRecipients(selectedRecipients) ?? ""}
                    />
                    <Input
                      name="composeQuery"
                      defaultValue={composeQuery ?? ""}
                      placeholder="Search by username"
                    />
                    <Button type="submit">
                      <Search className="mr-2 h-4 w-4" />
                      Search
                    </Button>
                  </form>

                  <div className="space-y-3">
                    <div className="text-sm font-medium">Recipients</div>
                    {selectedRecipients.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedRecipients.map((recipient) => (
                          <button
                            key={recipient.id}
                            type="button"
                            onClick={() => toggleRecipient(recipient)}
                            className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
                          >
                            @{recipient.username ?? "user"}
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                        Select one person for a DM, or multiple people for a group conversation.
                      </div>
                    )}
                  </div>

                  {selectedRecipients.length > 1 ? (
                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="group-name">
                        Group name
                      </label>
                      <Input
                        id="group-name"
                        value={groupName}
                        onChange={(event) => {
                          const nextGroupName = event.target.value;
                          setGroupName(nextGroupName);
                          updateComposeSearch({ composeGroup: nextGroupName || undefined });
                        }}
                        placeholder="Optional group name"
                      />
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    <div className="text-sm font-medium">
                      {trimmedComposeQuery
                        ? `Results for "${trimmedComposeQuery}"`
                        : "Suggested profiles"}
                    </div>
                    <div className="rounded-lg border">
                      {searchUsersLoading ? (
                        <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Searching profiles...
                        </div>
                      ) : visibleUsers.length > 0 ? (
                        visibleUsers.map((candidate, index) => {
                          return (
                            <button
                              key={candidate.id}
                              type="button"
                              disabled={isCreatingConversation}
                              onClick={() => toggleRecipient(candidate)}
                              className={cn(
                                "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent",
                                index < visibleUsers.length - 1 && "border-b",
                              )}
                            >
                              <Avatar className="h-10 w-10">
                                <AvatarImage
                                  src={candidate.avatar_url || ""}
                                  alt={candidate.username ?? "User"}
                                />
                                <AvatarFallback>
                                  {(candidate.username ?? "GP").slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium">
                                  @{candidate.username ?? "user"}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {candidate.is_public ? "Public profile" : "Private profile"}
                                </div>
                              </div>
                              <span className="rounded-md border px-2.5 py-1 text-xs font-medium">
                                Add
                              </span>
                            </button>
                          );
                        })
                      ) : (
                        <div className="p-6 text-sm text-muted-foreground">
                          No users match that search yet.
                        </div>
                      )}
                    </div>
                  </div>

                  {composeError ? (
                    <div className="text-sm text-destructive">{composeError}</div>
                  ) : null}

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() => void handleCreateConversation()}
                      disabled={selectedRecipients.length === 0 || isCreatingConversation}
                    >
                      {isCreatingConversation ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      {selectedRecipients.length > 1 ? "Create conversation" : "Start conversation"}
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            </div>
          ) : selectedId && selectedConversation ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center border-b p-4">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage
                      src={selectedConversation.peer_profile?.avatar_url || ""}
                      alt={getConversationDisplayName(selectedConversation)}
                    />
                    <AvatarFallback>{getConversationInitials(selectedConversation)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-semibold">
                      {getConversationDisplayName(selectedConversation)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {selectedConversation.is_group
                        ? selectedConversation.group_name || "Group conversation"
                        : selectedConversation.peer_profile?.username
                          ? `@${selectedConversation.peer_profile.username}`
                          : "Direct message"}
                    </div>
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
                  {messages.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      No messages yet. Send one to start the conversation.
                    </div>
                  ) : null}
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
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-muted-foreground">
              <div>Select a conversation or start a new one.</div>
              <Button asChild>
                <Link
                  to="/messages"
                  search={{
                    compose: true,
                    composeGroup: undefined,
                    composeQuery: undefined,
                    composeRecipients: [],
                    conversationId: undefined,
                    flash: undefined,
                    flashType: undefined,
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New message
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
