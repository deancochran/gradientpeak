import { invalidateConversationQueries } from "@repo/api/react";
import { getConversationDisplayName, getConversationInitials, getConversationPreviewText } from "@repo/core/messaging";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@repo/ui/components/resizable";
import { ScrollArea } from "@repo/ui/components/scroll-area";
import { Separator } from "@repo/ui/components/separator";
import { cn } from "@repo/ui/lib/cn";
import { createFileRoute } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { useEffect, useState } from "react";

import { useAuth } from "../../components/providers/auth-provider";
import { api } from "../../lib/api/client";

export const Route = createFileRoute("/_protected/messages")({ component: MessagesPage });

function MessagesPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const { user } = useAuth();
  const utils = api.useUtils();
  const { data: conversations = [] } = api.messaging.getConversations.useQuery();

  useEffect(() => {
    if (!selectedId && conversations.length > 0) setSelectedId(conversations[0]?.id ?? null);
  }, [conversations, selectedId]);

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const { data: messages = [] } = api.messaging.getMessages.useQuery({ conversation_id: selectedId! }, { enabled: Boolean(selectedId), refetchInterval: 5000 });
  const sendMessageMutation = api.messaging.sendMessage.useMutation({
    onSuccess: async () => {
      setInputText("");
      if (selectedId) await invalidateConversationQueries(utils, selectedId);
    },
  });

  const handleSend = () => {
    if (!selectedId || !inputText.trim()) return;
    sendMessageMutation.mutate({ conversation_id: selectedId, content: inputText });
  };

  return (
    <div className="h-[calc(100vh-8rem)] w-full overflow-hidden rounded-lg border bg-background">
      <ResizablePanelGroup className="h-full w-full">
        <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
          <div className="flex h-full flex-col">
            <div className="p-4 font-semibold">Messages</div>
            <Separator />
            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-2 p-4">
                {conversations.map((conversation) => (
                  <button key={conversation.id} className={cn("flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all hover:bg-accent", selectedId === conversation.id && "bg-accent")} onClick={() => setSelectedId(conversation.id)}>
                    <div className="flex w-full flex-col gap-1"><div className="flex items-center"><div className="flex items-center gap-2"><div className="font-semibold">{getConversationDisplayName(conversation)}</div></div><div className="ml-auto text-xs text-muted-foreground">{conversation.last_message_at ? new Date(conversation.last_message_at).toLocaleDateString() : ""}</div></div></div>
                    <div className="line-clamp-2 text-xs text-muted-foreground">{getConversationPreviewText(conversation)}</div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={75}>
          {selectedId && selectedConversation ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center border-b p-4"><div className="flex items-center gap-2"><Avatar><AvatarFallback>{getConversationInitials(selectedConversation)}</AvatarFallback></Avatar><div className="font-semibold">{getConversationDisplayName(selectedConversation)}</div></div></div>
              <ScrollArea className="flex-1 p-4"><div className="flex flex-col gap-4">{messages.map((message) => { const isMe = message.sender_id === user?.id; return <div key={message.id} className={cn("flex w-max max-w-[75%] flex-col gap-2 rounded-lg px-3 py-2 text-sm", isMe ? "ml-auto bg-primary text-primary-foreground" : "bg-muted")}>{message.content}</div>; })}</div></ScrollArea>
              <div className="border-t p-4"><div className="flex items-center gap-2"><Input placeholder="Type a message..." value={inputText} onChange={(event) => setInputText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); handleSend(); } }} /><Button size="icon" onClick={handleSend} disabled={!inputText.trim() || sendMessageMutation.isPending}><Send className="h-4 w-4" /></Button></div></div>
            </div>
          ) : <div className="flex h-full items-center justify-center text-muted-foreground">Select a conversation to start chatting</div>}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
