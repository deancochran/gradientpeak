import { useLayoutEffect, useRef } from "react";

type DraftLifecycle = {
  commit: () => void;
  discard: () => void;
};

const pendingDrafts = new WeakMap<object, Set<DraftLifecycle>>();

function flushPendingFormDrafts(control: object) {
  const drafts = pendingDrafts.get(control);

  if (!drafts) {
    return;
  }

  for (const draft of [...drafts]) {
    draft.commit();
  }
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

export { discardPendingFormDrafts, flushPendingFormDrafts, usePendingFormDraft };
