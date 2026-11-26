/** Finite API transport metadata; producers must allowlist values and exclude raw errors. */
export type SafeApiErrorDiagnostic = {
  applicationErrorCode: string | null;
  errorClass: string;
  httpStatus: number | null;
  trpcCode: string | null;
};
