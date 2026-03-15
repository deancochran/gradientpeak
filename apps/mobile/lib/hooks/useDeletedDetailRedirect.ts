import { useCallback, useRef, useState } from "react";

type TrpcLikeError =
  | {
      data?: {
        code?: string;
      } | null;
    }
  | null
  | undefined;

type UseDeletedDetailRedirectOptions = {
  onRedirect: () => void;
};

export function useDeletedDetailRedirect({
  onRedirect,
}: UseDeletedDetailRedirectOptions) {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const hasRedirectedRef = useRef(false);

  const beginRedirect = useCallback(() => {
    if (hasRedirectedRef.current) {
      return;
    }

    hasRedirectedRef.current = true;
    setIsRedirecting(true);
    onRedirect();
  }, [onRedirect]);

  const redirectOnNotFound = useCallback(
    (error: TrpcLikeError) => {
      if (error?.data?.code !== "NOT_FOUND") {
        return;
      }

      beginRedirect();
    },
    [beginRedirect],
  );

  return {
    beginRedirect,
    isRedirecting,
    redirectOnNotFound,
  };
}
