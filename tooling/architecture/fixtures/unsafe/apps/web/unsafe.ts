declare const externalValue: unknown;
declare const maybeValue: { id: string } | undefined;

export const explicit: any = externalValue;
export const asserted = externalValue as any;
export const doubleCast = externalValue as unknown as { id: string };
export const required = maybeValue!.id;

// @ts-expect-error Deliberate fixture for architecture scanning.
export const expectedFailure: string = 42;
