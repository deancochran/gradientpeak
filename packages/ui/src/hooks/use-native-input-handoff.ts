import { useEffect, useRef } from "react";
import { Keyboard } from "react-native";
import { useNativeInputPresentationOwner } from "./native-input-presentation.native";

// A focus lease, not form state: a dismissed picker must not focus over a newer one.
let latestPresentation = 0;

export interface NativeInputSession {
  isCurrent: () => boolean;
  /** Latest for this field; another field may own the global focus lease. */
  isLatest: () => boolean;
  close: () => void;
  restoreFocus: () => void;
}

/** Keyboard/focus ownership only. No form values, persistence or restoration of drafts. */
export function useNativeInputHandoff(options: {
  disabled?: boolean | undefined;
  identity?: string | number | undefined;
  owner?: object | undefined;
  isCurrent?: (() => boolean) | undefined;
  focus: () => void;
  onSuperseded?: (() => void) | undefined;
}) {
  const latest = useRef(options);
  latest.current = options;
  const alive = useRef(true);
  const state = useRef({
    identity: options.identity,
    owner: options.owner,
    disabled: options.disabled,
    generation: 0,
    ticket: 0,
    phase: "idle",
  });
  const presentation = useNativeInputPresentationOwner(() => {
    state.current.generation += 1;
    state.current.phase = "idle";
    latest.current.onSuperseded?.();
  });
  if (
    state.current.identity !== options.identity ||
    state.current.owner !== options.owner ||
    state.current.disabled !== options.disabled
  ) {
    state.current = {
      identity: options.identity,
      owner: options.owner,
      disabled: options.disabled,
      generation: state.current.generation + 1,
      ticket: state.current.ticket,
      phase: "idle",
    };
  }
  const generation = state.current.generation;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const usable = () =>
    alive.current &&
    state.current.generation === generation &&
    !latest.current.disabled &&
    (latest.current.isCurrent?.() ?? true);
  return {
    presented: presentation.presented,
    usable,
    prepare: () => {
      if (usable()) {
        if (state.current.phase === "open" && state.current.ticket !== latestPresentation) return;
        if (state.current.phase !== "open") latestPresentation += 1;
        if (state.current.phase !== "open") presentation.claim();
        Keyboard.dismiss();
      }
    },
    invalidate: () => {
      state.current.generation += 1;
      state.current.phase = "idle";
      presentation.release();
    },
    begin: (): NativeInputSession | undefined => {
      if (!usable()) return;
      presentation.claim();
      Keyboard.dismiss();
      const ticket = ++latestPresentation;
      state.current.ticket = ticket;
      state.current.phase = "open";
      const isLatest = () => usable() && state.current.ticket === ticket;
      return {
        isLatest,
        isCurrent: () =>
          isLatest() &&
          latestPresentation === ticket &&
          state.current.phase === "open" &&
          presentation.isCurrent(),
        close: () => {
          if (isLatest() && state.current.phase === "open") {
            if (latestPresentation === ticket) Keyboard.dismiss();
            state.current.phase = "closed";
            presentation.release();
          }
        },
        restoreFocus: () => {
          if (!isLatest() || latestPresentation !== ticket || state.current.phase !== "closed")
            return;
          state.current.phase = "restored";
          latest.current.focus();
        },
      };
    },
  };
}
