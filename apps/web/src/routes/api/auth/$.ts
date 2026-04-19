import { getGradientPeakAuth } from "@repo/auth/server";
import { resolveDatabaseUrl, users } from "@repo/db";
import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { logServerEvent } from "../../../lib/server-log";

let authRoutePool: Pool | null = null;

function getAuthRouteDb() {
  if (!authRoutePool) {
    authRoutePool = new Pool({
      connectionString: resolveDatabaseUrl(process.env),
    });
  }

  return drizzle(authRoutePool);
}

function createJsonErrorResponse(status: number, message: string) {
  return Response.json({ message }, { status });
}

async function parseAuthRequestBody(request: Request) {
  const bodyText = await request.clone().text();

  if (!bodyText) {
    return null;
  }

  try {
    return JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function findAuthUserByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  const db = getAuthRouteDb();
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  return user ?? null;
}

async function guardAuthPostRequest(request: Request) {
  const body = await parseAuthRequestBody(request);
  const pathname = new URL(request.url).pathname;
  const email = typeof body?.email === "string" ? body.email : null;

  if (!email) {
    return {};
  }

  const user = await findAuthUserByEmail(email);

  if (pathname.endsWith("/api/auth/sign-up/email") && user) {
    return {
      response: createJsonErrorResponse(409, "User already exists. Use another email."),
    };
  }

  if (pathname.endsWith("/api/auth/send-verification-email") && user?.emailVerified) {
    return {
      response: createJsonErrorResponse(400, "Email already verified. Sign in instead."),
    };
  }

  return {};
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => {
        logServerEvent(
          "auth.route.request",
          {
            routeType: "better-auth",
          },
          { request },
        );
        const auth = getGradientPeakAuth();

        return auth.handler(request);
      },
      POST: ({ request }) => {
        logServerEvent(
          "auth.route.request",
          {
            routeType: "better-auth",
          },
          { request },
        );
        const auth = getGradientPeakAuth();

        return guardAuthPostRequest(request).then(({ response }) => {
          if (response) {
            return response;
          }

          return auth.handler(request);
        });
      },
    },
  },
});
