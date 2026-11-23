import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { type Page, test } from "@playwright/test";
import { AuthPage } from "../../pages/auth";
import { createE2EExecutionIdentity } from "../../support/identity";

import {
  cleanupRegisteredAuthActor,
  registerAuthActor,
  registerCapturedVerification,
} from "./artifact-registry";

type CapturedAuthMail = {
  capturedAt: string;
  kind: "verification" | "reset-password" | "change-email-confirmation";
  to: string;
  actionUrl: string;
};

function capturePath() {
  const path = process.env.AUTH_EMAIL_CAPTURE_PATH;
  if (!path) throw new Error("AUTH_EMAIL_CAPTURE_PATH is required for real auth journeys");
  return path;
}

export async function waitForAuthMail(input: {
  to: string;
  kind: CapturedAuthMail["kind"];
  after: number;
}) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const contents = await readFile(capturePath(), "utf8").catch(() => "");
    const match = contents
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CapturedAuthMail)
      .reverse()
      .find(
        (mail) =>
          mail.to === input.to &&
          mail.kind === input.kind &&
          Date.parse(mail.capturedAt) >= input.after,
      );
    if (match) {
      if (match.kind === "verification") registerCapturedVerification(match.actionUrl);
      return match;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${input.kind} mail`);
}

export function uniqueAuthActor(prefix: string) {
  const suffix = createE2EExecutionIdentity(test.info()).suffix(`auth-actor-${prefix}`, 16);
  // biome-ignore lint/security/noSecrets: Public test-only credential for disposable local actors.
  const actor = { email: `${prefix}-${suffix}@example.test`, password: "TestPass123!" };
  registerAuthActor(actor.email);
  return actor;
}

export async function signUp(page: Page, actor: { email: string; password: string }) {
  await cleanupRegisteredAuthActor(actor.email);
  const after = Date.now();
  await new AuthPage(page).signUp(actor);
  return waitForAuthMail({ to: actor.email, kind: "verification", after });
}

export async function login(page: Page, actor: { email: string; password: string }) {
  const auth = new AuthPage(page);
  await auth.openLogin();
  await auth.signIn(actor);
}

export function expiredVerificationUrl(actionUrl: string) {
  const url = new URL(actionUrl);
  const token = url.searchParams.get("token");
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!token || !secret) {
    throw new Error("Verification expiry journey requires BETTER_AUTH_SECRET and a captured token");
  }
  const [encodedHeader, encodedPayload] = token.split(".");
  if (!encodedHeader || !encodedPayload)
    throw new Error("Captured verification token is not a JWT");
  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
  payload.exp = Math.floor(Date.now() / 1000) - 60;
  const nextPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`${encodedHeader}.${nextPayload}`)
    .digest("base64url");
  url.searchParams.set("token", `${encodedHeader}.${nextPayload}.${signature}`);
  return url.toString();
}
