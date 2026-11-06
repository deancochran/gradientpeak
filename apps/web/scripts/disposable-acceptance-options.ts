export function acceptanceOptions(input: string[]) {
  const native = input.includes("--native") || input.some((arg) => arg.includes("e2e/native/"));
  return { native, args: input.filter((arg) => arg !== "--" && arg !== "--native") };
}

export function acceptanceOrigin(value: string | undefined) {
  if (!value || !/^http:\/\/127\.0\.0\.1:\d+$/.test(value)) {
    throw new Error("Acceptance requires its harness-owned loopback origin.");
  }
  const port = Number(new URL(value).port);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid acceptance port");
  return value;
}
