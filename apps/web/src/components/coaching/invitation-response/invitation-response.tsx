import { Button } from "@repo/ui/components/button";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  acceptOrganizationInvitation,
  declineOrganizationInvitation,
  loadMyOrganizationInvitations,
  previewOrganizationInvitation,
} from "../../../lib/coaching/invitation-response-server-functions";

type InboxPage = Awaited<ReturnType<typeof loadMyOrganizationInvitations>>;
type InboxState =
  | { page?: InboxPage; status: "error"; cursor: string | null }
  | { page?: InboxPage; status: "loading"; cursor: string | null }
  | { page: InboxPage; status: "success"; cursor: string | null };

export function InvitationResponse({ actorId }: { actorId: string }) {
  const [token, setToken] = useState("");
  const [preview, setPreview] = useState<Awaited<
    ReturnType<typeof previewOrganizationInvitation>
  > | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [responseFailure, setResponseFailure] = useState<{
    choice: "accept" | "decline";
    token: string;
  } | null>(null);
  const [receipt, setReceipt] = useState<"accepted" | "declined" | null>(null);
  const [inbox, setInbox] = useState<InboxState>({ cursor: null, status: "loading" });
  const inboxGeneration = useRef(0);
  const tokenGeneration = useRef(0);
  const currentActorId = useRef(actorId);
  const inboxInFlight = useRef(false);
  const previewInFlight = useRef(false);
  const responseInFlight = useRef(false);
  const loadInbox = useCallback(
    (cursor: string | null, previousPage?: InboxPage, replace = false) => {
      if (inboxInFlight.current && !replace) return;
      const generationAtStart = ++inboxGeneration.current;
      const actorIdAtStart = currentActorId.current;
      inboxInFlight.current = true;
      setInbox({ cursor, page: previousPage, status: "loading" });
      void loadMyOrganizationInvitations({ data: { limit: 20, cursor } })
        .then((page) => {
          if (
            inboxGeneration.current === generationAtStart &&
            currentActorId.current === actorIdAtStart
          ) {
            setInbox({ cursor, page, status: "success" });
          }
        })
        .catch(() => {
          if (
            inboxGeneration.current === generationAtStart &&
            currentActorId.current === actorIdAtStart
          ) {
            setInbox({ cursor, page: previousPage, status: "error" });
          }
        })
        .finally(() => {
          if (inboxGeneration.current === generationAtStart) inboxInFlight.current = false;
        });
    },
    [],
  );
  useEffect(() => {
    currentActorId.current = actorId;
    inboxGeneration.current++;
    tokenGeneration.current++;
    previewInFlight.current = false;
    responseInFlight.current = false;
    setToken("");
    setPreview(null);
    setPreviewError(false);
    setResponseFailure(null);
    setReceipt(null);
    loadInbox(null, undefined, true);
  }, [actorId, loadInbox]);
  const clear = (value: string) => {
    tokenGeneration.current++;
    previewInFlight.current = false;
    responseInFlight.current = false;
    setToken(value);
    setPreview(null);
    setPreviewError(false);
    setResponseFailure(null);
    setReceipt(null);
  };
  const inspect = async () => {
    if (previewInFlight.current || responseInFlight.current || responseFailure) return;
    const generationAtStart = ++tokenGeneration.current;
    previewInFlight.current = true;
    setPreviewError(false);
    setResponseFailure(null);
    try {
      const result = await previewOrganizationInvitation({ data: { token } });
      if (generationAtStart === tokenGeneration.current) setPreview(result);
    } catch {
      if (generationAtStart === tokenGeneration.current) {
        setPreview(null);
        setPreviewError(true);
      }
    } finally {
      if (generationAtStart === tokenGeneration.current) previewInFlight.current = false;
    }
  };
  const respond = async (choice: "accept" | "decline", commandToken = token) => {
    if (responseInFlight.current || previewInFlight.current) return;
    const generationAtStart = ++tokenGeneration.current;
    responseInFlight.current = true;
    setResponseFailure(null);
    try {
      const result =
        choice === "accept"
          ? await acceptOrganizationInvitation({ data: { token: commandToken } })
          : await declineOrganizationInvitation({ data: { token: commandToken } });
      if (generationAtStart !== tokenGeneration.current) return;
      if (result.status === "accepted" || result.status === "declined") {
        setReceipt(result.status);
        setPreview(null);
        loadInbox(null, inbox.status === "success" ? inbox.page : undefined, true);
      } else setPreview(result);
    } catch {
      if (generationAtStart === tokenGeneration.current) {
        setPreview(null);
        setResponseFailure({ choice, token: commandToken });
      }
    } finally {
      if (generationAtStart === tokenGeneration.current) responseInFlight.current = false;
    }
  };
  const inboxPage = inbox.page;
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Organization invitations</h1>
      {inbox.status === "loading" && <p role="status">Loading invitation summaries…</p>}
      {inbox.status === "error" && (
        <div role="alert" className="space-y-2">
          <p>Invitation summaries could not be refreshed.</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => loadInbox(inbox.cursor, inboxPage)}
          >
            Retry invitation summaries
          </Button>
        </div>
      )}
      {inboxPage && (
        <div className="space-y-2">
          <p className="text-muted-foreground">
            {inboxPage.items.length
              ? `${inboxPage.items.length} invitation summaries`
              : "No invitation summaries."}
          </p>
          {inboxPage.items.length > 0 && (
            <ul aria-label="Invitation summaries" className="space-y-1">
              {inboxPage.items.map((item) => (
                <li key={item.invitationId}>
                  {item.kind} invitation · {item.status} ·{" "}
                  {item.requestedRole ?? "no role requested"} · expires {String(item.expiresAt)}
                </li>
              ))}
            </ul>
          )}
          {inbox.status === "success" && inboxPage.hasMore && inboxPage.nextCursor && (
            <Button
              type="button"
              variant="outline"
              onClick={() => loadInbox(inboxPage.nextCursor, inboxPage)}
            >
              Next invitation summaries
            </Button>
          )}
        </div>
      )}
      <label className="block">
        Invitation token
        <input
          aria-label="Invitation token"
          className="mt-1 block w-full rounded border p-2"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(event) => clear(event.target.value)}
        />
      </label>
      <Button
        type="button"
        disabled={!token || Boolean(responseFailure)}
        onClick={() => void inspect()}
      >
        Preview invitation
      </Button>
      {previewError && (
        <div role="alert" className="space-y-2">
          <p>Invitation preview could not be confirmed.</p>
          <Button type="button" variant="outline" onClick={() => void inspect()}>
            Retry preview
          </Button>
        </div>
      )}
      {preview?.status === "ready" && (
        <div role="status" className="space-y-2">
          <p>
            {preview.preview.organizationName} · {preview.preview.kind}
          </p>
          <Button type="button" onClick={() => void respond("accept")}>
            Accept invitation
          </Button>
          <Button type="button" variant="outline" onClick={() => void respond("decline")}>
            Decline invitation
          </Button>
        </div>
      )}
      {preview?.status === "unavailable" && <p role="alert">This invitation is unavailable.</p>}
      {responseFailure && (
        <div role="alert" className="space-y-2">
          <p>
            We could not confirm whether this invitation was{" "}
            {responseFailure.choice === "accept" ? "accepted" : "declined"}.
          </p>
          <Button
            type="button"
            onClick={() => void respond(responseFailure.choice, responseFailure.token)}
          >
            Retry {responseFailure.choice} invitation to reconcile
          </Button>
        </div>
      )}
      {receipt && (
        <p role="status">
          Invitation {receipt}. Keep this confirmation if navigation or refresh is unavailable.
        </p>
      )}
    </section>
  );
}
