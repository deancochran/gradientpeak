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
  options?: DeviceGattQueueOptions;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  controller: AbortController;
}

class DeviceGattQueue {
  private operations: QueuedOperation<unknown>[] = [];
  private activeOperation?: QueuedOperation<unknown>;
  private processing = false;
  private cancelled = false;

  constructor(private readonly deviceId: string) {}

  enqueue<T>(
    label: string,
    operation: (context: DeviceGattOperationContext) => Promise<T>,
    options?: DeviceGattQueueOptions,
  ): Promise<T> {
    if (this.cancelled) {
      return Promise.reject(new Error(`GATT queue cancelled for ${this.deviceId}: ${label}`));
    }

    return new Promise<T>((resolve, reject) => {
      this.operations.push({
        label,
        operation: operation as (context: DeviceGattOperationContext) => Promise<unknown>,
        options,
        resolve: resolve as (value: unknown) => void,
        reject,
        controller: new AbortController(),
      });
      void this.process();
    });
  }

  cancel(reason = "Device GATT queue cancelled"): void {
    this.cancelled = true;
    const error = new Error(reason);
    this.activeOperation?.controller.abort(reason);
    for (const operation of this.operations.splice(0)) {
      operation.controller.abort(reason);
      operation.reject(error);
    }
  }

  private async process(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;
    try {
      while (!this.cancelled && this.operations.length > 0) {
        const next = this.operations.shift();
        if (!next) {
          continue;
        }

        this.activeOperation = next;
        try {
          const value = await this.runWithTimeout(next);
          next.resolve(value);
        } catch (error) {
          next.reject(error);
        } finally {
          this.activeOperation = undefined;
        }
      }
    } finally {
      this.processing = false;
    }
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
      const timeout = setTimeout(() => {
        operation.controller.abort(`GATT operation timed out: ${operation.label}`);
        reject(new Error(`GATT operation timed out: ${operation.label}`));
      }, timeoutMs);

      operation
        .operation({
          deviceId: this.deviceId,
          label: operation.label,
          signal: operation.controller.signal,
        })
        .then(resolve, reject)
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
    this.queues.delete(deviceId);
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
}
