export const DEFAULT_ACTIVITY_FILE_PARSE_MAX_RECORDS = 1_000_000;
export const DEFAULT_ACTIVITY_FILE_PARSE_MAX_MESSAGES = 2_000_000;

export type ActivityFileParseLimits = Readonly<{
  /** Maximum normalized record messages accepted from one source artifact. */
  maxRecords?: number;
  /** Maximum total source work: FIT messages or XML node-shaped inputs. */
  maxMessages?: number;
}>;

export type ResolvedActivityFileParseLimits = Readonly<{
  maxRecords: number;
  maxMessages: number;
}>;

function boundedPositiveInteger(value: number, maximum: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

/** Resolves caller-specific limits without allowing the parser's hard ceilings to be bypassed. */
export function resolveActivityFileParseLimits(
  limits?: ActivityFileParseLimits,
): ResolvedActivityFileParseLimits {
  const maxRecords = boundedPositiveInteger(
    limits?.maxRecords ?? DEFAULT_ACTIVITY_FILE_PARSE_MAX_RECORDS,
    DEFAULT_ACTIVITY_FILE_PARSE_MAX_RECORDS,
    "maxRecords",
  );
  const defaultMessagesForRecordLimit = Math.min(
    DEFAULT_ACTIVITY_FILE_PARSE_MAX_MESSAGES,
    maxRecords * 4 + 1_024,
  );
  const maxMessages = boundedPositiveInteger(
    limits?.maxMessages ?? defaultMessagesForRecordLimit,
    DEFAULT_ACTIVITY_FILE_PARSE_MAX_MESSAGES,
    "maxMessages",
  );
  return { maxRecords, maxMessages };
}
