import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type PresentationOwner = {
  active: symbol | null;
  claim: (owner: symbol, superseded: () => void) => void;
  release: (owner: symbol) => void;
  isCurrent: (owner: symbol) => boolean;
};
const Context = createContext<PresentationOwner | null>(null);

/** One active input presenter per form. It contains no form values or persisted state. */
export function NativeInputPresentationProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<symbol | null>(null);
  const current = useRef<symbol | null>(null);
  const deactivate = useRef<(() => void) | null>(null);
  const claim = useCallback((owner: symbol, superseded: () => void) => {
    const previous = current.current !== owner ? deactivate.current : null;
    current.current = owner;
    deactivate.current = superseded;
    setActive(owner);
    previous?.();
  }, []);
  const release = useCallback((owner: symbol) => {
    if (current.current === owner) {
      current.current = null;
      deactivate.current = null;
      setActive(null);
    }
  }, []);
  const isCurrent = useCallback((owner: symbol) => current.current === owner, []);
  const value = useMemo(
    () => ({ active, claim, release, isCurrent }),
    [active, claim, release, isCurrent],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useNativeInputPresentationOwner(onSuperseded: () => void) {
  const context = useContext(Context);
  const owner = useRef(Symbol("native-input"));
  const superseded = useRef(onSuperseded);
  superseded.current = onSuperseded;
  const local = useRef(false);
  const [localActive, setLocalActive] = useState(false);
  const releaseOwner = context?.release;
  const isCurrentOwner = context?.isCurrent;
  const release = useCallback(() => {
    if (releaseOwner) releaseOwner(owner.current);
    else {
      local.current = false;
      setLocalActive(false);
    }
  }, [releaseOwner]);
  useEffect(
    () => () => {
      if (isCurrentOwner ? isCurrentOwner(owner.current) : local.current) superseded.current();
      release();
    },
    [release, isCurrentOwner],
  );
  return {
    presented: context ? context.active === owner.current : localActive,
    claim: () => {
      if (context) context.claim(owner.current, () => superseded.current());
      else {
        local.current = true;
        setLocalActive(true);
      }
    },
    release,
    isCurrent: () => (context ? context.isCurrent(owner.current) : local.current),
  };
}
