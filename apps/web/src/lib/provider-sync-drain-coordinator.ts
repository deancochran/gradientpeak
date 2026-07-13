export class ProviderSyncDrainCoordinator<T> {
  private active: Promise<T> | undefined;
  private nextFamilyStart = 0;

  allocateCapacity(total: number): [number, number, number] {
    const allocations: [number, number, number] = [0, 0, 0];
    for (let index = 0; index < total; index += 1) {
      const target = ((this.nextFamilyStart + index) % allocations.length) as 0 | 1 | 2;
      allocations[target] += 1;
    }
    this.nextFamilyStart = (this.nextFamilyStart + 1) % allocations.length;
    return allocations;
  }

  async run(
    start: () => Promise<T>,
  ): Promise<{ alreadyRunning: true } | { alreadyRunning: false; result: T }> {
    if (this.active) return { alreadyRunning: true };
    const invocation = start();
    this.active = invocation;
    try {
      return { alreadyRunning: false, result: await invocation };
    } finally {
      if (this.active === invocation) this.active = undefined;
    }
  }
}
