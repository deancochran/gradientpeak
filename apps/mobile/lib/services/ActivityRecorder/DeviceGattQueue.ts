export interface DeviceGattOperationContext {
  deviceId: string;
  label: string;
  signal: AbortSignal;
}

export interface DeviceGattQueueOptions {
  timeoutMs?: number;
}

interface QueuedOperation<T> {
  label: string;
  operation: (context: DeviceGattOperationContext) => Promise<T>;
  options: DeviceGattQueueOptions | undefined;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  controller: AbortController;
  cancelled: boolean;
}

interface ActiveInterrupt {
  label: string;
  controller: AbortController;
  result: Promise<unknown>;
  barrier: Promise<void>;
}

class DeviceGattQueue {
  private operations: QueuedOperation<unknown>[] = [];
  private activeOperation: QueuedOperation<unknown> | undefined;
  private barriers = new Set<Promise<void>>();
  private idleListeners = new Set<() => void>();
  private activeInterrupt: ActiveInterrupt | undefined;
  private processing = false;

  constructor(private readonly deviceId: string) {}

  enqueue<T>(
    label: string,
    operation: (context: DeviceGattOperationContext) => Promise<T>,
    options?: DeviceGattQueueOptions,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.operations.push({
        label,
        operation: operation as (context: DeviceGattOperationContext) => Promise<unknown>,
        options,
        resolve: resolve as (value: unknown) => void,
        reject,
        controller: new AbortController(),
        cancelled: false,
      });
      void this.process();
    });
  }

  cancel(reason = "Device GATT queue cancelled", abortInterrupt = true): void {
    const error = new Error(reason);
    if (this.activeOperation) {
      this.cancelOperation(this.activeOperation, error, reason);
    }
    for (const operation of this.operations.splice(0)) {
      this.cancelOperation(operation, error, reason);
    }
    if (abortInterrupt) this.activeInterrupt?.controller.abort(reason);
    this.notifyIdle();
  }

  interrupt<T>(
    label: string,
    operation: (context: DeviceGattOperationContext) => Promise<T>,
    options?: DeviceGattQueueOptions,
  ): Promise<T> {
    const activeInterrupt = this.activeInterrupt;
    if (activeInterrupt) {
      if (activeInterrupt.label === label) return activeInterrupt.result as Promise<T>;
      return activeInterrupt.barrier.then(() => this.interrupt(label, operation, options));
    }

    const controller = new AbortController();
    const nativeOperation = Promise.resolve().then(() =>
      operation({ deviceId: this.deviceId, label, signal: controller.signal }),
    );
    let barrier: Promise<void>;
    barrier = nativeOperation
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        this.barriers.delete(barrier);
        if (this.activeInterrupt?.barrier === barrier) this.activeInterrupt = undefined;
        void this.process();
        this.notifyIdle();
      });
    this.barriers.add(barrier);

    const timeoutMs = options?.timeoutMs;
    const result = timeoutMs
      ? new Promise<T>((resolve, reject) => {
          let settled = false;
          const timeout = setTimeout(() => {
            if (settled) return;
            settled = true;
            controller.abort(`GATT interrupt timed out: ${label}`);
            reject(new Error(`GATT interrupt timed out: ${label}`));
          }, timeoutMs);
          nativeOperation.then(
            (value) => {
              if (settled) return;
              settled = true;
              clearTimeout(timeout);
              resolve(value);
            },
            (error) => {
              if (settled) return;
              settled = true;
              clearTimeout(timeout);
              reject(error);
            },
          );
        })
      : nativeOperation;
    this.activeInterrupt = { label, controller, result, barrier };
    return result;
  }

  onIdle(listener: () => void): void {
    if (this.isIdle()) {
      listener();
      return;
    }
    this.idleListeners.add(listener);
  }

  getInterrupt<T>(label: string): { result: Promise<T> } | undefined {
    return this.activeInterrupt?.label === label
      ? { result: this.activeInterrupt.result as Promise<T> }
      : undefined;
  }

  private async process(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;
    try {
      while (this.operations.length > 0) {
        await this.waitForBarriers();
        if (this.barriers.size > 0) continue;
        const next = this.operations.shift();
        if (!next) {
          continue;
        }

        this.activeOperation = next;
        try {
          const value = await this.runWithTimeout(next);
          if (!next.cancelled) next.resolve(value);
        } catch (error) {
          if (!next.cancelled) next.reject(error);
        } finally {
          this.activeOperation = undefined;
        }
      }
    } finally {
      this.processing = false;
      if (this.operations.length > 0) void this.process();
      else this.notifyIdle();
    }
  }

  private async waitForBarriers(): Promise<void> {
    while (this.barriers.size > 0) {
      await Promise.all(this.barriers);
    }
  }

  private cancelOperation(operation: QueuedOperation<unknown>, error: Error, reason: string): void {
    if (operation.cancelled) return;
    operation.cancelled = true;
    operation.controller.abort(reason);
    operation.reject(error);
  }

  private isIdle(): boolean {
    return (
      !this.processing &&
      !this.activeOperation &&
      this.operations.length === 0 &&
      this.barriers.size === 0
    );
  }

  private notifyIdle(): void {
    if (!this.isIdle()) return;
    const listeners = [...this.idleListeners];
    this.idleListeners.clear();
    for (const listener of listeners) listener();
  }

  private runWithTimeout(operation: QueuedOperation<unknown>): Promise<unknown> {
    const timeoutMs = operation.options?.timeoutMs;
    if (!timeoutMs) {
      return operation.operation({
        deviceId: this.deviceId,
        label: operation.label,
        signal: operation.controller.signal,
      });
    }

    return new Promise((resolve, reject) => {
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        operation.controller.abort(`GATT operation timed out: ${operation.label}`);
      }, timeoutMs);

      // Do not settle the queue timeout until the native operation has settled.
      // BLE operations are serialized by the platform too; starting another one
      // while an aborted native call is still in flight can overlap requests.
      Promise.resolve()
        .then(() =>
          operation.operation({
            deviceId: this.deviceId,
            label: operation.label,
            signal: operation.controller.signal,
          }),
        )
        .then(
          (value) => {
            if (timedOut) {
              reject(new Error(`GATT operation timed out: ${operation.label}`));
            } else {
              resolve(value);
            }
          },
          (error) => {
            if (timedOut) {
              reject(new Error(`GATT operation timed out: ${operation.label}`));
            } else {
              reject(error);
            }
          },
        )
        .finally(() => clearTimeout(timeout));
    });
  }
}

export class DeviceGattQueueRegistry {
  private queues = new Map<string, DeviceGattQueue>();

  enqueue<T>(
    deviceId: string,
    label: string,
    operation: (context: DeviceGattOperationContext) => Promise<T>,
    options?: DeviceGattQueueOptions,
  ): Promise<T> {
    return this.getQueue(deviceId).enqueue(label, operation, options);
  }

  cancelDevice(deviceId: string, reason?: string): void {
    const queue = this.queues.get(deviceId);
    if (!queue) {
      return;
    }

    queue.cancel(reason);
    this.releaseWhenIdle(deviceId, queue);
  }

  interruptDevice<T>(
    deviceId: string,
    label: string,
    operation: (context: DeviceGattOperationContext) => Promise<T>,
    options?: DeviceGattQueueOptions,
    reason = "Device GATT queue interrupted",
  ): Promise<T> {
    const queue = this.getQueue(deviceId);
    const existing = queue.getInterrupt<T>(label);
    if (existing) return existing.result;
    queue.cancel(reason, false);
    const result = queue.interrupt(label, operation, options);
    this.releaseWhenIdle(deviceId, queue);
    return result;
  }

  private getQueue(deviceId: string): DeviceGattQueue {
    const existing = this.queues.get(deviceId);
    if (existing) {
      return existing;
    }

    const queue = new DeviceGattQueue(deviceId);
    this.queues.set(deviceId, queue);
    return queue;
  }

  private releaseWhenIdle(deviceId: string, queue: DeviceGattQueue): void {
    queue.onIdle(() => {
      if (this.queues.get(deviceId) === queue) this.queues.delete(deviceId);
    });
  }
}
