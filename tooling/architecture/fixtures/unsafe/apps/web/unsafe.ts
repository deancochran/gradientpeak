declare const externalValue: unknown;
declare const maybeValue: { id: string } | undefined;

// biome-ignore lint/suspicious/noExplicitAny: Deliberate unsafe fixture for architecture scanning.
export const explicit: any = externalValue;
// biome-ignore lint/suspicious/noExplicitAny: Deliberate unsafe fixture for architecture scanning.
export const asserted = externalValue as any;
export const doubleCast = externalValue as unknown as { id: string };
// biome-ignore lint/style/noNonNullAssertion: Deliberate unsafe fixture for architecture scanning.
export const required = maybeValue!.id;

// @ts-expect-error Deliberate fixture for architecture scanning.
export const expectedFailure: string = 42;
