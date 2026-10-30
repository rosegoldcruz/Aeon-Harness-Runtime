import { NextRequest, NextResponse } from "next/server"
import { authenticated, internalAvailable } from "@/lib/internal-auth"
import { backendAuthorization } from "@/lib/backend-principal"

// Private internal-only bridge. Never expose the loopback LangGraph API on Vercel.
export const dynamic = "force-dynamic"
const GET_PATH = [
  /^projects$/, /^source-review$/, /^source-review\/[a-z0-9-]{1,64}$/,
  /^source-review\/[a-z0-9-]{1,64}\/(?:objects|sheets|audit)$/,
  /^source-review\/[a-z0-9-]{1,64}\/page\/[1-9][0-9]{0,3}$/,
  /^catalogs$/, /^catalogs\/(?:hci-shaker|rythern-ddp|rythern-ddp-greystone|altaeuro-specs)$/, /^catalogs\/hci-shaker\/policy$/,
  /^takeoffs\/[a-z0-9]{12}\/(?:review|history|validation|schedule|lifecycle)$/,
  /^takeoffs\/[a-z0-9]{12}\/(?:workbooks|calculated)\/[a-f0-9]{64}$/,
  /^takeoff-profiles$/, /^takeoffs$/, /^takeoffs\/[a-z0-9]{12}$/,
  /^takeoffs\/[a-z0-9]{12}\/takeoff\.json$/,
  /^takeoffs\/[a-z0-9]{12}\/artifact$/,
]
const POST_PATH = [/^takeoffs$/, /^takeoffs\/[a-z0-9]{12}\/(?:files|run|resume|automated-bid|schedule|review|reconcile-views|estimate|workbook|recalculate)$/]
const origin = () => {
  const value = process.env.CABINET_API_ORIGIN ?? "http://127.0.0.1:7318"
  return /^http:\/\/(127\.0\.0\.1|localhost):[0-9]{2,5}$/.test(value) ? value : null
}
const hiddenKey = /^(path|source_path|copied_from|filepath|file_path|absolute_path|token|secret|password|authorization)$/i
const localPath = /\/(?:opt|srv|home|root|var|etc)\/[^\s"'<>]*/g
function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k]) => !hiddenKey.test(k)).map(([k, v]) => [k, clean(v)]))
  if (typeof value === "string") return value.replace(localPath, "[server path redacted]")
  return value
}
const json = (data: unknown, status = 200) => NextResponse.json(clean(data), { status, headers: { "Cache-Control": "no-store, private" } })
function authorize(req: NextRequest) {
  if (!internalAvailable(req)) return json({ error: "Internal backend unavailable" }, 404)
  if (!authenticated(req)) return json({ error: "Sign in to internal Cabinet Intelligence" }, 401)
  return null
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ segments: string[] }> }) {
  const denied = authorize(request); if (denied) return denied
  const path = (await params).segments.join("/")
  if (!GET_PATH.some(rx => rx.test(path))) return json({ error: "Route not available" }, 404)
  const backend = origin(); if (!backend) return json({ error: "Invalid internal backend configuration" }, 503)
  try {
    const artifact = path.endsWith("/artifact") ? request.nextUrl.searchParams.get("path") : null
    if (path.endsWith("/artifact") && (!artifact || artifact.length > 300 || artifact.startsWith("/") || artifact.split("/").some(part => part === ".." || part === "." || !part) || !/\.(?:png|json)$/.test(artifact)))
      return json({ error: "Invalid evidence path" }, 400)
    const query = artifact ? `?path=${encodeURIComponent(artifact)}` : path.includes("/page/") ? "?zoom=0.3" : path.startsWith("catalogs/") ? `?q=${encodeURIComponent(request.nextUrl.searchParams.get("q") ?? "")}` : ""
    const res = await fetch(`${backend}/api/${path}${query}`, { cache: "no-store", signal: AbortSignal.timeout(12000), headers: { Host: "127.0.0.1", ...backendAuthorization() } })
    if (res.headers.get("content-type")?.startsWith("image/png") && res.ok)
      return new NextResponse(await res.arrayBuffer(), { status: 200, headers: { "Content-Type": "image/png", "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" } })
    if (res.ok && res.headers.get("content-type")?.includes("spreadsheetml.sheet"))
      return new NextResponse(await res.arrayBuffer(), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Cache-Control": "no-store, private", "Content-Disposition": "attachment; filename=AEON-original-V6-internal-review.xlsx", "X-Content-Type-Options": "nosniff" } })
    return json(await res.json(), res.status)
  } catch { return json({ error: "Internal LangGraph API is offline" }, 503) }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ segments: string[] }> }) {
  const denied = authorize(request); if (denied) return denied
  const path = (await params).segments.join("/")
  if (!POST_PATH.some(rx => rx.test(path))) return json({ error: "Write route not available" }, 404)
  // Same-origin custom header + strict cookie: no cross-site browser writes.
  if (request.headers.get("x-aeon-action") !== "1" || request.headers.get("origin") !== `http://${request.headers.get("host")}`)
    return json({ error: "Same-origin action required" }, 403)
  const backend = origin(); if (!backend) return json({ error: "Invalid internal backend configuration" }, 503)
  const upload = path.endsWith("/files")
  const type = request.headers.get("content-type")?.split(";")[0]
  if (type !== (upload ? "application/pdf" : "application/json")) return json({ error: "Invalid content type" }, 415)
  const size = Number(request.headers.get("content-length") ?? "0")
  if (!Number.isFinite(size) || size > (upload ? 512 * 1024 * 1024 : 262144)) return json({ error: "Request too large" }, 413)
  const body = await request.arrayBuffer()
  if (body.byteLength > (upload ? 512 * 1024 * 1024 : 262144)) return json({ error: "Request too large" }, 413)
  const name = request.headers.get("x-file-name") ?? ""
  if (upload && (!name || name.length > 180 || !name.toLowerCase().endsWith(".pdf"))) return json({ error: "PDF filename required" }, 400)
  try {
    const res = await fetch(`${backend}/api/${path}`, { method: "POST", signal: AbortSignal.timeout(upload || path.endsWith("/recalculate") ? 180000 : 30000), headers: {
      Host: "127.0.0.1", ...backendAuthorization(), Origin: "http://127.0.0.1:7318", "Content-Type": type!, ...(upload ? { "X-File-Name": name, "X-Source-Kind": ["plan", "addendum", "specification"].includes(request.headers.get("x-source-kind") ?? "") ? request.headers.get("x-source-kind")! : "plan" } : {}),
    }, body: body.byteLength ? Buffer.from(body) : undefined })
    return json(await res.json(), res.status)
  } catch { return json({ error: "Internal LangGraph API is offline or timed out" }, 503) }
}
