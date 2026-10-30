import { NextRequest, NextResponse } from "next/server"
import { authenticated, authConfigured, cookieName, cookieOptions, internalAvailable, loginValid, session } from "@/lib/internal-auth"
export const dynamic = "force-dynamic"

const unavailable = () => NextResponse.json({ error: "Internal review is unavailable" }, { status: 404 })
export async function GET(req: NextRequest) {
  if (!internalAvailable(req)) return unavailable()
  return NextResponse.json({ authenticated: authenticated(req), configured: authConfigured() }, { headers: { "Cache-Control": "no-store" } })
}
export async function POST(req: NextRequest) {
  if (!internalAvailable(req)) return unavailable()
  if (req.headers.get("origin") !== `http://${req.headers.get("host")}` || req.headers.get("content-type")?.split(";")[0] !== "application/json") return NextResponse.json({ error: "Same-origin JSON login required" }, { status: 403 })
  if (!authConfigured()) return NextResponse.json({ error: "Internal login is not configured" }, { status: 503 })
  if (Number(req.headers.get("content-length") ?? 0) > 1024) return NextResponse.json({ error: "Request too large" }, { status: 413 })
  let body: { username?: unknown; password?: unknown }
  try { const text = await req.text(); if (Buffer.byteLength(text) > 1024) return NextResponse.json({ error: "Request too large" }, { status: 413 }); body = JSON.parse(text) } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }) }
  if (typeof body.username !== "string" || typeof body.password !== "string" || !loginValid(body.username, body.password)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
  }
  const res = NextResponse.json({ authenticated: true }, { headers: { "Cache-Control": "no-store" } })
  res.cookies.set(cookieName, session(body.username), { ...cookieOptions, secure: req.nextUrl.protocol === "https:" })
  return res
}
export async function DELETE(req: NextRequest) {
  if (!internalAvailable(req)) return unavailable()
  const res = NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "no-store" } })
  res.cookies.delete(cookieName)
  return res
}
