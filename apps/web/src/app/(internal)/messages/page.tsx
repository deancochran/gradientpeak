"use client";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@repo/ui/components/resizable";
import { ScrollArea } from "@repo/ui/components/scroll-area";
import { Separator } from "@repo/ui/components/separator";
import { Input } from "@repo/ui/components/input";
import { Button } from "@repo/ui/components/button";
import { Send } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@repo/ui/lib/cn";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { useAuth } from "@/components/providers/auth-provider";

export default function MessagesPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { user } = useAuth();
  const { data: conversations = [] } =
    trpc.messaging.getConversations.useQuery();
  type Conversation = (typeof conversations)[number];

  const { data: messages = [] } = trpc.messaging.getMessages.useQuery(
    { conversation_id: selectedId! },
    { enabled: !!selectedId, refetchInterval: 5000 },
  );

  const [inputText, setInputText] = useState("");
  const utils = trpc.useUtils();

  const sendMessageMutation = trpc.messaging.sendMessage.useMutation({
    onSuccess: () => {
      setInputText("");
      utils.messaging.getMessages.invalidate({ conversation_id: selectedId! });
    },
  });

  const handleSend = () => {
    if (!selectedId || !inputText.trim()) return;
    sendMessageMutation.mutate({
      conversation_id: selectedId,
      content: inputText,
    });
  };

  return (
    <div className="h-[calc(100vh-8rem)] w-full border rounded-lg overflow-hidden bg-background">
      <ResizablePanelGroup className="h-full w-full">
        <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
          <div className="flex h-full flex-col">
            <div className="p-4 font-semibold">Messages</div>
            <Separator />
            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-2 p-4">
                {conversations.map((conv: Conversation) => (
                  <button
                    key={conv.id}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all hover:bg-accent",
                      selectedId === conv.id && "bg-accent",
                    )}
                    onClick={() => setSelectedId(conv.id)}
                  >
                    <div className="flex w-full flex-col gap-1">
                      <div className="flex items-center">
                        <div className="flex items-center gap-2">
                          <div className="font-semibold">
                            {conv.group_name || "Conversation"}
                          </div>
                        </div>
                        <div className="ml-auto text-xs text-muted-foreground">
                          {new Date(conv.last_message_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="line-clamp-2 text-xs text-muted-foreground">
                      {conv.messages?.[0]?.content || "No messages"}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={75}>
          {selectedId ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center p-4 border-b">
                <div className="flex items-center gap-2">
                  <Avatar>
                    <AvatarFallback>CN</AvatarFallback>
                  </Avatar>
                  <div className="font-semibold">Chat</div>
                </div>
              </div>
              <ScrollArea className="flex-1 p-4">
                <div className="flex flex-col gap-4">
                  {messages.map((msg) => {
                    const isMe = msg.sender_id === user?.id;
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          "flex w-max max-w-[75%] flex-col gap-2 rounded-lg px-3 py-2 text-sm",
                          isMe
                            ? "ml-auto bg-primary text-primary-foreground"
                            : "bg-muted",
                        )}
                      >
                        {msg.content}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              <div className="p-4 border-t">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={!inputText.trim()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
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
