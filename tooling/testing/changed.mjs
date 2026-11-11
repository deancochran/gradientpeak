export const GIT_DIFF_FILTER = "ACMRD";

export function changedDiffArguments(base) {
  const target = base ? `${base}...HEAD` : "HEAD";
  return ["diff", "--name-only", "-z", `--diff-filter=${GIT_DIFF_FILTER}`, target];
}

export function untrackedFilesArguments() {
  return ["ls-files", "--others", "--exclude-standard", "-z"];
}

export function parseNulSeparatedPaths(output) {
  const text = Buffer.isBuffer(output) ? output.toString("utf8") : String(output);
  return text.split("\0").filter(Boolean);
}
