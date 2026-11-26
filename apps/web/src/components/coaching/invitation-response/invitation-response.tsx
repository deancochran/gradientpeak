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
type Receipt = { status: "accepted"; staffOrganizationId: string | null } | { status: "declined" };

export function InvitationResponse({
  actorId,
  initialInvitationToken,
}: {
  actorId: string;
  initialInvitationToken?: string;
}) {
  const [token, setToken] = useState(initialInvitationToken ?? "");
  const [selectedInvitationId, setSelectedInvitationId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Awaited<
    ReturnType<typeof previewOrganizationInvitation>
  > | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [responseFailure, setResponseFailure] = useState<{
    choice: "accept" | "decline";
    token: string;
    invitationId: string | null;
    acknowledgement?: { accepted: true; digest: string; version: string };
    staffInvitation: boolean;
  } | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [inbox, setInbox] = useState<InboxState>({ cursor: null, status: "loading" });
  const inboxGeneration = useRef(0);
  const tokenGeneration = useRef(0);
  const currentActorId = useRef(actorId);
  const inboxInFlight = useRef(false);
  const previewInFlight = useRef(false);
  const responseInFlight = useRef(false);
  const initialPreviewStarted = useRef(false);
  const loadInbox = useCallback(
    (cursor: string | null, previousPage?: InboxPage, replace = false) => {
      if (inboxInFlight.current && !replace) return;
      const generationAtStart = ++inboxGeneration.current;
      const actorIdAtStart = currentActorId.current;
      inboxInFlight.current = true;
      setInbox({ cursor, ...(previousPage ? { page: previousPage } : {}), status: "loading" });
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
            setInbox({ cursor, ...(previousPage ? { page: previousPage } : {}), status: "error" });
          }
        })
        .finally(() => {
          if (inboxGeneration.current === generationAtStart) inboxInFlight.current = false;
        });
    },
    [],
  );
  useEffect(() => {
    const actorChanged = currentActorId.current !== actorId;
    currentActorId.current = actorId;
    if (!actorChanged) {
      loadInbox(null, undefined, true);
      return;
    }
    inboxGeneration.current++;
    tokenGeneration.current++;
    previewInFlight.current = false;
    responseInFlight.current = false;
    setToken("");
    setSelectedInvitationId(null);
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
    setSelectedInvitationId(null);
    setPreview(null);
    setPreviewError(false);
    setResponseFailure(null);
    setReceipt(null);
  };
  const inspect = async (
    commandToken = token,
    invitationId: string | null = selectedInvitationId,
  ) => {
    if (previewInFlight.current || responseInFlight.current || responseFailure) return;
    const generationAtStart = ++tokenGeneration.current;
    previewInFlight.current = true;
    setPreviewError(false);
    setPreview(null);
    setReceipt(null);
    setSelectedInvitationId(invitationId);
    setResponseFailure(null);
    try {
      const result = await previewOrganizationInvitation({
        data: invitationId ? { invitationId } : { token: commandToken },
      });
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
  // The handoff is intentionally previewed once for the identity that mounted this surface.
  // biome-ignore lint/correctness/useExhaustiveDependencies: inspect is deliberately one-shot.
  useEffect(() => {
    if (!initialInvitationToken || initialPreviewStarted.current) return;
    initialPreviewStarted.current = true;
    clear(initialInvitationToken);
    void inspect(initialInvitationToken);
  }, [initialInvitationToken]);
  const respond = async (
    choice: "accept" | "decline",
    commandToken = token,
    retryAcknowledgement?: { accepted: true; digest: string; version: string },
    invitationId: string | null = selectedInvitationId,
    retryStaffInvitation = false,
  ) => {
    if (responseInFlight.current || previewInFlight.current) return;
    const generationAtStart = ++tokenGeneration.current;
    const actorIdAtStart = currentActorId.current;
    responseInFlight.current = true;
    setResponseFailure(null);
    const acceptingStaffInvitation =
      choice === "accept" &&
      (retryStaffInvitation || (preview?.status === "ready" && preview.preview.kind === "staff"));
    const acknowledgement =
      retryAcknowledgement ??
      (preview?.status === "ready" &&
      preview.preview.kind === "athlete" &&
      preview.preview.agreement
        ? {
            version: preview.preview.agreement.version,
            digest: preview.preview.agreement.digest,
            accepted: true as const,
          }
        : undefined);
    try {
      const result =
        choice === "accept"
          ? await acceptOrganizationInvitation({
              data: {
                ...(invitationId ? { invitationId } : { token: commandToken }),
                ...(acknowledgement ? { acknowledgement } : {}),
              },
            })
          : await declineOrganizationInvitation({
              data: invitationId ? { invitationId } : { token: commandToken },
            });
      if (
        generationAtStart !== tokenGeneration.current ||
        currentActorId.current !== actorIdAtStart
      )
        return;
      if (result.status === "accepted" || result.status === "declined") {
        setReceipt(
          result.status === "accepted"
            ? {
                status: "accepted",
                // The navigation target comes only from the durable acceptance receipt.
                staffOrganizationId: acceptingStaffInvitation
                  ? result.receipt.organizationId
                  : null,
              }
            : { status: "declined" },
        );
        setPreview(null);
        loadInbox(null, inbox.status === "success" ? inbox.page : undefined, true);
      } else setPreview(result);
    } catch {
      if (
        generationAtStart === tokenGeneration.current &&
        currentActorId.current === actorIdAtStart
      ) {
        setPreview(null);
        setResponseFailure({
          choice,
          token: commandToken,
          invitationId,
          staffInvitation: acceptingStaffInvitation,
          ...(acknowledgement ? { acknowledgement } : {}),
        });
      }
    } finally {
      if (generationAtStart === tokenGeneration.current) responseInFlight.current = false;
    }
  };
  const inboxPage = inbox.page;
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Organization invitations</h1>
      {!initialInvitationToken && (
        <p className="text-sm text-muted-foreground">
          Review a pending invitation below. Invitations sent to your verified email are available
          here even if you created your account or verified your email in another tab.
        </p>
      )}
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
                  {item.status === "pending" && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={Boolean(responseFailure)}
                      onClick={() => void inspect("", item.invitationId)}
                    >
                      Review invitation
                    </Button>
                  )}
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
          data-ph-no-capture
          data-sentry-mask
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
          {preview.preview.kind === "athlete" ? (
            <div className="space-y-3">
              <h2 className="font-medium">Coaching data-sharing agreement</h2>
              <p className="text-sm text-muted-foreground">
                {preview.preview.agreement?.terms ?? "The current agreement could not be loaded."}
              </p>
              <p className="text-sm text-muted-foreground">
                This acceptance records agreement version{" "}
                {preview.preview.agreement?.version ?? "unknown"} for all six read scopes:{" "}
                {preview.preview.agreement?.scopes.join(", ") ?? ""}.
              </p>
              <Button
                type="button"
                disabled={!preview.preview.agreement}
                onClick={() => void respond("accept")}
              >
                Accept invitation &amp; share training data
              </Button>
            </div>
          ) : (
            <Button type="button" onClick={() => void respond("accept")}>
              Accept invitation
            </Button>
          )}
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
            onClick={() =>
              void respond(
                responseFailure.choice,
                responseFailure.token,
                responseFailure.acknowledgement,
                responseFailure.invitationId,
                responseFailure.staffInvitation,
              )
            }
          >
            Retry {responseFailure.choice} invitation to reconcile
          </Button>
        </div>
      )}
      {receipt && (
        <div role="status" className="space-y-2">
          <p>
            Invitation {receipt.status}. Keep this confirmation if navigation or refresh is
            unavailable.
          </p>
          {receipt.status === "accepted" && receipt.staffOrganizationId ? (
            <Button asChild type="button">
              <a href={`/organizations/${receipt.staffOrganizationId}`}>Open organization</a>
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
