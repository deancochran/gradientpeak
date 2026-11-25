/**
 * Narrows a fixture-derived value after preserving the test's failure mode.
 *
 * Test fixtures are data too: a missing value is an invalid fixture, not a
 * reason to continue an assertion with an invented fallback.
 */
export function requireFixtureValue<T>(value: T, message: string): NonNullable<T> {
  if (value === undefined || value === null) {
    throw new Error(message);
  }

  return value;
}
