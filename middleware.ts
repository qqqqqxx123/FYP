import { isAdminSession } from "@/lib/session";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const session = request.cookies.get("crm-session")?.value;
  const isAdmin = isAdminSession(session);
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin") && !session) {
    const login = new URL("/login", request.url);
    login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  }

  if (pathname.startsWith("/admin") && session && !isAdmin) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (pathname.startsWith("/dashboard") && !session) {
    const login = new URL("/login", request.url);
    login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  }

  if (pathname === "/login" && session) {
    const loginOtpRequired = request.nextUrl.searchParams.get("loginOtpRequired");
    if (loginOtpRequired !== "1") {
      return NextResponse.redirect(new URL(isAdmin ? "/admin" : "/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin", "/admin/:path*", "/login"],
};
