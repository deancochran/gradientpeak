import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import { useDeletedDetailRedirect } from "../useDeletedDetailRedirect";

function HookState(props: {
  beginRedirect: () => void;
  isRedirecting: boolean;
}) {
  return React.createElement("HookState", props);
}

function Harness(props: {
  error?: { data?: { code?: string } | null } | null;
  onRedirect: () => void;
}) {
  const { beginRedirect, isRedirecting, redirectOnNotFound } =
    useDeletedDetailRedirect({ onRedirect: props.onRedirect });

  React.useEffect(() => {
    redirectOnNotFound(props.error);
  }, [props.error, redirectOnNotFound]);

  return (
    <HookState beginRedirect={beginRedirect} isRedirecting={isRedirecting} />
  );
}

describe("useDeletedDetailRedirect", () => {
  it("redirects once when a delete flow begins", () => {
    const onRedirect = vi.fn();
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<Harness onRedirect={onRedirect} />);
    });

    const state = renderer.root.findByType(HookState);

    act(() => {
      state.props.beginRedirect();
      state.props.beginRedirect();
    });

    expect(onRedirect).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByType(HookState).props.isRedirecting).toBe(true);
  });

  it("redirects when the detail query returns NOT_FOUND", () => {
    const onRedirect = vi.fn();
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <Harness
          onRedirect={onRedirect}
          error={{ data: { code: "NOT_FOUND" } }}
        />,
      );
    });

    expect(onRedirect).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByType(HookState).props.isRedirecting).toBe(true);
  });

  it("ignores non-NOT_FOUND query errors", () => {
    const onRedirect = vi.fn();
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <Harness
          onRedirect={onRedirect}
          error={{ data: { code: "FORBIDDEN" } }}
        />,
      );
    });

    expect(onRedirect).not.toHaveBeenCalled();
    expect(renderer.root.findByType(HookState).props.isRedirecting).toBe(false);
  });
});
