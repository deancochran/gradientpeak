/**
 * Removes absent keys before forwarding an object to an exact-optional contract.
 * Explicit `null` values are retained so callers can preserve clearing semantics.
 */
export function omitUndefined<const T extends object>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, property]) => property !== undefined),
  ) as {
    [Key in keyof T as undefined extends T[Key] ? never : Key]: T[Key];
  } & {
    [Key in keyof T as undefined extends T[Key] ? Key : never]?: Exclude<T[Key], undefined>;
  };
}
