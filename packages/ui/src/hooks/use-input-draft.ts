import { useEffect, useRef, useState } from "react";

/** Keep an editable string when a controlled parent echoes its parsed value.
 * A different external value (or identity, such as a unit change) still replaces it.
 * Callers explicitly replace/normalize the draft at their commit boundary.
 */
export function useInputDraft(value: string, identity?: string | number) {
  const [draftValue, setDraftValue] = useState(value);
  const expectedEchoes = useRef<string[]>([]);
  const previousIdentity = useRef(identity);

  useEffect(() => {
    const sameIdentity = previousIdentity.current === identity;
    previousIdentity.current = identity;
    const isOwnEcho = sameIdentity && expectedEchoes.current.includes(value);
    expectedEchoes.current = [];
    if (!isOwnEcho) setDraftValue(value);
  }, [value, identity]);

  const updateDraft = (nextValue: string, echoes: string[] = []) => {
    expectedEchoes.current = [nextValue, ...echoes];
    setDraftValue(nextValue);
  };

  return [draftValue, updateDraft] as const;
}
