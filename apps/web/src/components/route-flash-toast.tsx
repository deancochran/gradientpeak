import { useEffect } from "react";
import { toast } from "sonner";

export type RouteFlashType = "success" | "error" | "info";

export function RouteFlashToast({
  clear,
  message,
  type = "info",
}: {
  clear: () => void;
  message?: string;
  type?: RouteFlashType;
}) {
  useEffect(() => {
    if (!message) {
      return;
    }

    if (type === "success") {
      toast.success(message);
    } else if (type === "error") {
      toast.error(message);
    } else {
      toast(message);
    }

    clear();
  }, [clear, message, type]);

  return null;
}
