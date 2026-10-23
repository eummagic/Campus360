import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next") ?? "/profile";
  // Accept only same-origin path references. Reject protocol-relative URLs and
  // backslashes, which browsers may normalize into a different authority.
  const next = requestedNext.startsWith("/") &&
    !requestedNext.startsWith("//") &&
    !requestedNext.includes("\\") &&
    !requestedNext.startsWith("/\\")
    ? requestedNext
    : "/profile";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL("/login?error=auth_callback", origin));
    }
  }

  return NextResponse.redirect(new URL(next, origin));
}
