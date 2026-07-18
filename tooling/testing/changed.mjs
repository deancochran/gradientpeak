export const GIT_DIFF_FILTER = "ACMRD";

export function changedDiffArguments(base) {
  const target = base ? `${base}...HEAD` : "HEAD";
  return ["diff", "--name-only", `--diff-filter=${GIT_DIFF_FILTER}`, target];
}
