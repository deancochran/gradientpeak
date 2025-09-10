import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  // Only process API routes intended for mobile app
  if (!request.nextUrl.pathname.startsWith("/api/mobile/")) {
    return NextResponse.next();
  }

  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 },
      );
    }

    const token = authHeader.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "No access token provided" },
        { status: 401 },
      );
    }

    // Create Supabase client and verify the token
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error("Token verification failed:", error);
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 },
      );
    }

    // Verify user email is confirmed (required for app access)
    if (!user.email_confirmed_at) {
      return NextResponse.json(
        { error: "Email not confirmed" },
        { status: 403 },
      );
    }

    // Add user information to request headers for API routes
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", user.id);
    requestHeaders.set("x-user-email", user.email || "");

    // Add user metadata if available
    if (user.user_metadata) {
      requestHeaders.set("x-user-metadata", JSON.stringify(user.user_metadata));
    }

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (error) {
    console.error("Middleware error:", error);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 },
    );
  }
}

export const config = {
  matcher: ["/api/mobile/:path*"],
};
