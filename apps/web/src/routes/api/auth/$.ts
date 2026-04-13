import { resolveDatabaseUrl, users } from "@repo/db";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getGradientPeakAuth } from "@repo/auth/server";

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
  const bodyText = await request.text();
  const forwardedRequest = new Request(request, {
    body: bodyText,
  });

  if (!bodyText) {
    return { body: null, forwardedRequest };
  }

  try {
    return {
      body: JSON.parse(bodyText) as Record<string, unknown>,
      forwardedRequest,
    };
  } catch {
    return { body: null, forwardedRequest };
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
  const { body, forwardedRequest } = await parseAuthRequestBody(request);
  const pathname = new URL(request.url).pathname;
  const email = typeof body?.email === "string" ? body.email : null;

  if (!email) {
    return { forwardedRequest };
  }

  const user = await findAuthUserByEmail(email);

  if (pathname.endsWith("/api/auth/sign-up/email") && user) {
    return {
      forwardedRequest,
      response: createJsonErrorResponse(409, "User already exists. Use another email."),
    };
  }

  if (pathname.endsWith("/api/auth/send-verification-email") && user?.emailVerified) {
    return {
      forwardedRequest,
      response: createJsonErrorResponse(400, "Email already verified. Sign in instead."),
    };
  }

  return { forwardedRequest };
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

        return guardAuthPostRequest(request).then(({ forwardedRequest, response }) => {
          if (response) {
            return response;
          }

          return auth.handler(forwardedRequest);
        });
      },
    },
  },
});
