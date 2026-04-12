import nodemailer from "nodemailer";
import type { AuthRuntimeEnv } from "./env";

export type AuthEmailKind = "reset-password" | "verification" | "change-email-confirmation";

export interface SendAuthEmailInput {
  kind: AuthEmailKind;
  to: string;
  actionUrl: string;
  userEmail: string;
  newEmail?: string;
}

export interface AuthMailer {
  send(input: SendAuthEmailInput): Promise<void>;
}

let transporterSingleton: nodemailer.Transporter | null = null;

function getTransporter(env: AuthRuntimeEnv) {
  if (transporterSingleton) return transporterSingleton;

  transporterSingleton = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure ?? env.smtpPort === 465,
    ...(env.smtpUser && env.smtpPass
      ? {
          auth: {
            user: env.smtpUser,
            pass: env.smtpPass,
          },
        }
      : {}),
  });

  return transporterSingleton;
}

function buildMessage(input: SendAuthEmailInput) {
  if (input.kind === "reset-password") {
    return {
      subject: "Reset your GradientPeak password",
      text: `Use this link to reset your password: ${input.actionUrl}`,
      html: `<p>Use this link to reset your password:</p><p><a href="${input.actionUrl}">${input.actionUrl}</a></p>`,
    };
  }

  if (input.kind === "change-email-confirmation") {
    return {
      subject: "Confirm your GradientPeak email change",
      text: `Approve the email change for ${input.userEmail}${input.newEmail ? ` to ${input.newEmail}` : ""}: ${input.actionUrl}`,
      html: `<p>Approve the email change for ${input.userEmail}${input.newEmail ? ` to ${input.newEmail}` : ""}:</p><p><a href="${input.actionUrl}">${input.actionUrl}</a></p>`,
    };
  }

  return {
    subject: "Verify your GradientPeak email",
    text: `Verify your email with this link: ${input.actionUrl}`,
    html: `<p>Verify your email with this link:</p><p><a href="${input.actionUrl}">${input.actionUrl}</a></p>`,
  };
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  return `${name.slice(0, 2)}***@${domain}`;
}

export function createAuthMailer(env: AuthRuntimeEnv): AuthMailer {
  return {
    async send(input) {
      if (env.emailMode === "disabled") return;

      if (env.emailMode === "log") {
        console.info("[auth-email] log delivery", {
          kind: input.kind,
          to: maskEmail(input.to),
          actionUrl: input.actionUrl,
        });
        return;
      }

      if (!env.emailFrom || !env.smtpHost || !env.smtpPort) {
        throw new Error(
          "SMTP email mode requires AUTH_EMAIL_FROM, AUTH_SMTP_HOST, and AUTH_SMTP_PORT",
        );
      }

      const message = buildMessage(input);
      const transporter = getTransporter(env);

      console.info("[auth-email] smtp delivery attempt", {
        kind: input.kind,
        to: maskEmail(input.to),
        smtpHost: env.smtpHost,
        smtpPort: env.smtpPort,
        actionUrl: input.actionUrl,
      });

      await transporter.sendMail({
        from: env.emailFrom,
        to: input.to,
        replyTo: env.emailReplyTo,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });

      console.info("[auth-email] smtp delivery success", {
        kind: input.kind,
        to: maskEmail(input.to),
        smtpHost: env.smtpHost,
        smtpPort: env.smtpPort,
      });
    },
  };
}
