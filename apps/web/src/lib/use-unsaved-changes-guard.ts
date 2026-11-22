import { useBlocker } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

type UnsavedChangesGuardOptions = {
  draft: unknown;
  dirty: boolean;
  message?: string;
  pending?: boolean;
};

export const PENDING_SAVE_MESSAGE = "Saving changes. Please wait...";

/** Blocks leaving an editor without changing the draft or its save lifecycle. */
export function useUnsavedChangesGuard({
  draft,
  dirty,
  message = "Discard unsaved changes?",
  pending = false,
}: UnsavedChangesGuardOptions) {
  const draftKey = JSON.stringify(draft);
  const [savedDraftKey, setSavedDraftKey] = useState<string | null>(null);
  const enabledRef = useRef(false);
  const pendingRef = useRef(false);
  const savedForDraft = savedDraftKey === draftKey;
  // A pending operation is committed only by markSaved. Until then it can neither
  // be discarded nor treated as a cancellable in-flight edit, even on a clean draft.
  const enabled = !savedForDraft && (dirty || pending);
  enabledRef.current = enabled;
  pendingRef.current = pending;

  useEffect(() => {
    if (!dirty && !pending && savedDraftKey !== null) setSavedDraftKey(null);
  }, [dirty, pending, savedDraftKey]);

  useBlocker({
    disabled: !enabled,
    // Function form keeps beforeunload in lockstep with markSaved/markSaveFailed
    // before the next render re-registers the blocker, so authoritative redirects bypass.
    enableBeforeUnload: () => enabledRef.current,
    // TanStack expects true to block. A pending operation blocks with clear feedback;
    // otherwise Cancel keeps the draft and discard allows the transition.
    shouldBlockFn: () => {
      if (!enabledRef.current) return false;
      if (pendingRef.current) {
        window.alert(PENDING_SAVE_MESSAGE);
        return true;
      }
      return !window.confirm(message);
    },
  });

  const markSaved = () => {
    setSavedDraftKey(draftKey);
    enabledRef.current = false;
  };
  const markSaveFailed = () => {
    setSavedDraftKey(null);
    enabledRef.current = dirty || pending;
  };
  const guardedCancel = (onDiscard: () => void) => {
    if (pendingRef.current && enabledRef.current) {
      window.alert(PENDING_SAVE_MESSAGE);
      return false;
    }
    if (enabledRef.current && !window.confirm(message)) return false;
    enabledRef.current = false;
    setSavedDraftKey(draftKey);
    onDiscard();
    return true;
  };

  return { guardedCancel, markSaveFailed, markSaved };
}
