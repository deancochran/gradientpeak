import { ChatScreen } from "@/components/chatbot/ChatScreen";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function ChatRoute() {
  const actorId = useAuthStore((state) => state.user?.id ?? null);
  return actorId ? <ChatScreen actorId={actorId} /> : null;
}
