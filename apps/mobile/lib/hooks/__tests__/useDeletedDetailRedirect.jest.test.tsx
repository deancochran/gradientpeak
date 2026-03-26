import { act, renderHook } from "@testing-library/react-native";
import React from "react";

import { useDeletedDetailRedirect } from "../useDeletedDetailRedirect";

function useHarness(
  error: { data?: { code?: string } | null } | null | undefined,
  onRedirect: () => void,
) {
  const state = useDeletedDetailRedirect({ onRedirect });
  React.useEffect(() => {
    state.redirectOnNotFound(error);
  }, [error, state]);
  return state;
}

describe("useDeletedDetailRedirect", () => {
  it("redirects once when a delete flow begins", () => {
    const onRedirect = jest.fn();
    const { result } = renderHook(() => useHarness(undefined, onRedirect));

    act(() => {
      result.current.beginRedirect();
      result.current.beginRedirect();
    });

    expect(onRedirect).toHaveBeenCalledTimes(1);
    expect(result.current.isRedirecting).toBe(true);
  });

  it("redirects when the detail query returns NOT_FOUND", () => {
    const onRedirect = jest.fn();
    const { result } = renderHook(() => useHarness({ data: { code: "NOT_FOUND" } }, onRedirect));

    expect(onRedirect).toHaveBeenCalledTimes(1);
    expect(result.current.isRedirecting).toBe(true);
  });

  it("ignores non-NOT_FOUND query errors", () => {
    const onRedirect = jest.fn();
    const { result } = renderHook(() => useHarness({ data: { code: "FORBIDDEN" } }, onRedirect));

    expect(onRedirect).not.toHaveBeenCalled();
    expect(result.current.isRedirecting).toBe(false);
  });
});
