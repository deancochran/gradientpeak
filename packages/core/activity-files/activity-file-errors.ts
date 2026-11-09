export type ActivityFileParseErrorCode = "corrupt_artifact" | "unsupported_format";

/** Closed parser failure that callers may safely treat as a permanent artifact limitation. */
export class ActivityFileParseError extends Error {
  constructor(
    public readonly code: ActivityFileParseErrorCode,
    cause?: unknown,
  ) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "ActivityFileParseError";
  }
}
