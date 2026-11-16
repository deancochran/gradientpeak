const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Validates a DOB calendar date represented by the `YYYY-MM-DD` contract. */
export function isValidDateOfBirth(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Parses a validated DOB at UTC midnight for timestamp persistence compatibility. */
export function parseDateOfBirth(value: string): Date | null {
  return isValidDateOfBirth(value) ? new Date(`${value}T00:00:00.000Z`) : null;
}

/** Formats a persisted timestamp as the DOB date-only contract. */
export function formatDateOfBirth(value: Date): string {
  return `${value.getUTCFullYear().toString().padStart(4, "0")}-${(value.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}-${value.getUTCDate().toString().padStart(2, "0")}`;
}

/** Calculates age from UTC calendar dates, rather than elapsed-time approximations. */
export function calculateDateOfBirthAge(dob: string, asOf = new Date()): number | null {
  const birthDate = parseDateOfBirth(dob);
  if (!birthDate) return null;

  let age = asOf.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = asOf.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }
  return age;
}
