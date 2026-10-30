import { createHmac, timingSafeEqual } from "node:crypto"
import { NextRequest } from "next/server"

const COOKIE = "aeon_ci_session"
const MAX_AGE = 8 * 60 * 60
const HOST = /^(127\.0\.0\.1|localhost):[0-9]{2,5}$/

export function internalAvailable(request: NextRequest): boolean {
  return process.env.CABINET_INTERNAL_BRIDGE === "1" && HOST.test(request.headers.get("host") ?? "")
}

function secret(): string | null {
  const value = process.env.CABINET_SESSION_SECRET
  return value && value.length >= 32 ? value : null
}

export function authConfigured(): boolean {
  return Boolean(secret() && process.env.CABINET_INTERNAL_USERNAME && process.env.CABINET_INTERNAL_PASSWORD)
}

export function loginValid(username: string, password: string): boolean {
  const expected = process.env.CABINET_INTERNAL_PASSWORD
  const user = process.env.CABINET_INTERNAL_USERNAME
  if (!authConfigured() || username !== user || !expected) return false
  const provided = createHmac("sha256", secret()!).update(password).digest()
  const actual = createHmac("sha256", secret()!).update(expected).digest()
  return timingSafeEqual(provided, actual)
}

export function session(username: string): string {
  const payload = Buffer.from(JSON.stringify({ user: username, exp: Date.now() + MAX_AGE * 1000 })).toString("base64url")
  const signature = createHmac("sha256", secret()!).update(payload).digest("hex")
  return `${payload}.${signature}`
}

export function authenticated(request: NextRequest): boolean {
  if (!internalAvailable(request) || !authConfigured()) return false
  const raw = request.cookies.get(COOKIE)?.value ?? ""
  const parts = raw.split(".")
  if (parts.length !== 2 || !/^[0-9a-f]{64}$/.test(parts[1])) return false
  const [payload, signature] = parts
  const expected = createHmac("sha256", secret()!).update(payload).digest("hex")
  if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) return false
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"))
    return value.user === process.env.CABINET_INTERNAL_USERNAME && Number.isSafeInteger(value.exp) && value.exp > Date.now() && value.exp <= Date.now() + MAX_AGE * 1000
  } catch { return false }
}

export const cookieOptions = { httpOnly: true, sameSite: "strict" as const, secure: false, path: "/", maxAge: MAX_AGE }
export const cookieName = COOKIE
