// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useReadOnlyPreview } from "./use-read-only-preview";

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

it("invalidates an A-B-A input round trip by generation, even with the same final fingerprint", async () => {
  const a = deferred<string>();
  const nextA = deferred<string>();
  const { result, rerender } = renderHook(({ key }) => useReadOnlyPreview<string>(key), {
    initialProps: { key: "a" },
  });
  const read = vi.fn(() => a.promise);
  act(() => {
    void result.current.run(read);
    void result.current.run(read);
  });
  expect(read).toHaveBeenCalledTimes(1);
  rerender({ key: "b" });
  rerender({ key: "a" });
  act(() => {
    void result.current.run(() => nextA.promise);
  });
  await act(async () => nextA.resolve("new"));
  await act(async () => a.resolve("old"));
  expect(result.current.data).toBe("new");
});

it("clearing cancels display ownership only and ignores the outstanding read's rejection", async () => {
  const pending = deferred<string>();
  const { result } = renderHook(() => useReadOnlyPreview<string>("a"));
  act(() => {
    void result.current.run(() => pending.promise);
  });
  act(() => result.current.clear());
  await act(async () => pending.reject(new Error("Old failure")));
  expect(result.current.error).toBeNull();
  expect(result.current.isPending).toBe(false);
  await act(async () => result.current.run(async () => "retry"));
  expect(result.current.data).toBe("retry");
});

it("does not dispatch a retained callback after its input context changed or unmounted", async () => {
  const { result, rerender, unmount } = renderHook(({ key }) => useReadOnlyPreview<string>(key), {
    initialProps: { key: "a" },
  });
  const oldRun = result.current.run;
  const read = vi.fn(async () => "old");
  rerender({ key: "b" });
  await act(async () => oldRun(read));
  const currentRun = result.current.run;
  unmount();
  await currentRun(read);
  expect(read).not.toHaveBeenCalled();
});
