import { useLayoutEffect, useRef, useState } from "react";

export type PendingInputIssue = { name: string; message: string; focus?: (() => void) | undefined };
type DraftLifecycle = {
  commit: () => void;
  discard: () => void;
  issue?: (() => PendingInputIssue | null) | undefined;
};

const pendingDrafts = new WeakMap<object, Set<DraftLifecycle>>();

function flushPendingFormDrafts(control: object) {
  const drafts = pendingDrafts.get(control);

  if (!drafts) {
    return [];
  }

  for (const draft of [...drafts]) {
    draft.commit();
  }
  return [...drafts].flatMap((draft) => draft.issue?.() ?? []);
}

function discardPendingFormDrafts(control: object) {
  const drafts = pendingDrafts.get(control);

  if (!drafts) {
    return;
  }

  for (const draft of [...drafts]) {
    draft.discard();
  }
}

function usePendingFormDraft(control: object | undefined, lifecycle: DraftLifecycle) {
  const lifecycleRef = useRef(lifecycle);
  lifecycleRef.current = lifecycle;

  useLayoutEffect(() => {
    if (!control) {
      return;
    }

    const registeredLifecycle: DraftLifecycle = {
      commit: () => lifecycleRef.current.commit(),
      discard: () => lifecycleRef.current.discard(),
      issue: () => lifecycleRef.current.issue?.() ?? null,
    };
    const drafts = pendingDrafts.get(control) ?? new Set<DraftLifecycle>();
    drafts.add(registeredLifecycle);
    pendingDrafts.set(control, drafts);

    return () => {
      drafts.delete(registeredLifecycle);
      if (drafts.size === 0) {
        pendingDrafts.delete(control);
      }
    };
  }, [control]);
}

/** Same-value resets must also reset string drafts that contain formatting. */
function useFormDraftResetKey(control: object | undefined) {
  const [revision, setRevision] = useState(0);
  usePendingFormDraft(control, {
    commit: () => undefined,
    discard: () => setRevision((value) => value + 1),
  });
  return revision;
}

export {
  discardPendingFormDrafts,
  flushPendingFormDrafts,
  useFormDraftResetKey,
  usePendingFormDraft,
};
