import { useEffect, useRef, useState } from "react";

/** Keep an editable string when a controlled parent echoes its parsed value.
 * A different external value (or identity, such as a unit change) still replaces it.
 * Callers explicitly replace/normalize the draft at their commit boundary.
 */
export function useInputDraft(value: string, identity?: string | number) {
  const [draftValue, setDraftValue] = useState(value);
  const current = useRef(value);
  const edited = useRef(false);
  const expectedEchoes = useRef<string[]>([]);
  const previousIdentity = useRef(identity);

  useEffect(() => {
    const sameIdentity = previousIdentity.current === identity;
    previousIdentity.current = identity;
    const isOwnEcho = sameIdentity && expectedEchoes.current.includes(value);
    expectedEchoes.current = [];
    if (!isOwnEcho) {
      current.current = value;
      edited.current = false;
      setDraftValue(value);
    }
  }, [value, identity]);

  const updateDraft = (nextValue: string, echoes: string[] = []) => {
    expectedEchoes.current = [nextValue, ...echoes];
    current.current = nextValue;
    edited.current = true;
    setDraftValue(nextValue);
  };

  const reset = (nextValue = value) => {
    expectedEchoes.current = [];
    current.current = nextValue;
    edited.current = false;
    setDraftValue(nextValue);
  };
  return [draftValue, updateDraft, { current, edited, reset }] as const;
}
