import { useEffect, useRef } from "react";
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
  const clearRef = useRef(clear);
  clearRef.current = clear;

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

    clearRef.current();
  }, [message, type]);

  return null;
}
