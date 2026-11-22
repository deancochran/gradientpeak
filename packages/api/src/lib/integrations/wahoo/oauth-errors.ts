export function isWahooTokenLimitRejection(error?: string, description?: string): boolean {
  const code = error?.toLowerCase().replaceAll("-", "_");
  if (
    code === "access_token_limit_exceeded" ||
    code === "token_limit_exceeded" ||
    code === "too_many_tokens"
  ) {
    return true;
  }

  const detail = description?.toLowerCase();
  if (!detail) return false;
  return (
    detail.includes("unrevoked access token") ||
    detail.includes("too many access token") ||
    (detail.includes("access token") &&
      (detail.includes("limit exceeded") || detail.includes("maximum") || detail.includes("max ")))
  );
}
