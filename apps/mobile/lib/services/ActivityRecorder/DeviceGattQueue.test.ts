import { describe, expect, it, vi } from "vitest";

import { DeviceGattQueueRegistry } from "./DeviceGattQueue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe("DeviceGattQueueRegistry", () => {
  it("does not overlap an aborted timeout with the next native operation", async () => {
    vi.useFakeTimers();
    const queue = new DeviceGattQueueRegistry();
    const first = deferred<string>();
    const started: string[] = [];
    const one = queue.enqueue(
      "device",
      "one",
      ({ signal }) => {
        started.push("one");
        expect(signal.aborted).toBe(false);
        return first.promise;
      },
      { timeoutMs: 10 },
    );
    const two = queue.enqueue("device", "two", async () => {
      started.push("two");
      return "two";
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(started).toEqual(["one"]);
    first.resolve("late");
    await expect(one).rejects.toThrow("GATT operation timed out: one");
    await expect(two).resolves.toBe("two");
    expect(started).toEqual(["one", "two"]);
    vi.useRealTimers();
  });

  it("cancels queued work and aborts the active operation", async () => {
    const queue = new DeviceGattQueueRegistry();
    const active = deferred<string>();
    let signal: AbortSignal | undefined;
    const one = queue.enqueue("device", "one", (context) => {
      signal = context.signal;
      return active.promise;
    });
    const two = queue.enqueue("device", "two", async () => "two");
    await Promise.resolve();
    queue.cancelDevice("device", "disconnect");
    expect(signal?.aborted).toBe(true);
    await expect(one).rejects.toThrow("disconnect");
    await expect(two).rejects.toThrow("disconnect");
    active.resolve("late");
  });

  it("keeps replacement work behind a cancelled native operation until it settles", async () => {
    const queue = new DeviceGattQueueRegistry();
    const active = deferred<string>();
    const started: string[] = [];
    const one = queue.enqueue("device", "one", () => {
      started.push("one");
      return active.promise;
    });
    await Promise.resolve();

    queue.cancelDevice("device", "reconnect");
    const replacement = queue.enqueue("device", "replacement", async () => {
      started.push("replacement");
      return "replacement";
    });

    await expect(one).rejects.toThrow("reconnect");
    await Promise.resolve();
    expect(started).toEqual(["one"]);

    active.resolve("late");
    await expect(replacement).resolves.toBe("replacement");
    expect(started).toEqual(["one", "replacement"]);
  });

  it("runs a disconnect interrupt immediately without releasing the native-operation fence", async () => {
    const queue = new DeviceGattQueueRegistry();
    const active = deferred<string>();
    const disconnect = deferred<void>();
    const started: string[] = [];
    const one = queue.enqueue("device", "one", () => {
      started.push("one");
      return active.promise;
    });
    await Promise.resolve();

    const interruption = queue.interruptDevice(
      "device",
      "disconnect",
      async () => {
        started.push("disconnect");
        return disconnect.promise;
      },
      undefined,
      "disconnect",
    );
    const replacement = queue.enqueue("device", "replacement", async () => {
      started.push("replacement");
      return "replacement";
    });
    await Promise.resolve();
    expect(started).toEqual(["one", "disconnect"]);

    disconnect.resolve();
    await expect(interruption).resolves.toBeUndefined();
    await Promise.resolve();
    expect(started).toEqual(["one", "disconnect"]);

    await expect(one).rejects.toThrow("disconnect");
    active.resolve("late");
    await expect(replacement).resolves.toBe("replacement");
    expect(started).toEqual(["one", "disconnect", "replacement"]);
  });

  it("coalesces concurrent disconnect interrupts for one device", async () => {
    const queue = new DeviceGattQueueRegistry();
    const disconnect = deferred<string>();
    let interruptSignal: AbortSignal | undefined;
    const nativeDisconnect = vi.fn(({ signal }: { signal: AbortSignal }) => {
      interruptSignal = signal;
      return disconnect.promise;
    });

    const first = queue.interruptDevice("device", "disconnect", nativeDisconnect);
    const second = queue.interruptDevice("device", "disconnect", nativeDisconnect);
    await Promise.resolve();

    expect(nativeDisconnect).toHaveBeenCalledTimes(1);
    expect(interruptSignal?.aborted).toBe(false);
    disconnect.resolve("disconnected");
    await expect(first).resolves.toBe("disconnected");
    await expect(second).resolves.toBe("disconnected");
  });

  it("runs normal operations in submission order", async () => {
    const queue = new DeviceGattQueueRegistry();
    const calls: string[] = [];
    await Promise.all([
      queue.enqueue("device", "one", async () => {
        calls.push("one");
        return 1;
      }),
      queue.enqueue("device", "two", async () => {
        calls.push("two");
        return 2;
      }),
    ]);
    expect(calls).toEqual(["one", "two"]);
  });
});
