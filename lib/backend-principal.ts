import { createHmac, randomUUID } from "node:crypto"

// Existing @vulpine/auth Vision-principal wire contract. Secrets remain server-side.
const scopes = ["project:read", "project:upload", "unit_mix:modify", "unit_mix:approve", "sku:override", "pricing:change", "qa:approve", "bid:mark_safe", "export:create", "outreach:send", "settings:admin", "engineering:inspect"]
const roles: Record<string, string[]> = {
  admin: scopes,
  estimator: ["project:read", "project:upload", "unit_mix:modify", "sku:override", "export:create"],
  reviewer: ["project:read", "unit_mix:modify", "unit_mix:approve", "sku:override", "pricing:change", "export:create"],
  viewer: ["project:read"],
}
export function backendAuthorization(): Record<string, string> {
  const secret = process.env.CABINET_PRINCIPAL_SECRET
  const org = process.env.CABINET_ORGANIZATION_ID
  const user = process.env.CABINET_INTERNAL_USERNAME
  const role = process.env.CABINET_INTERNAL_ROLE
  if (!secret || secret.length < 32 || !org || !user || !role || !roles[role]) return {}
  const now = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(JSON.stringify({ v: 1, sub: user, org, role, scopes: roles[role], iat: now, exp: now + 120, nonce: randomUUID() })).toString("base64url")
  const signature = createHmac("sha256", secret).update(payload).digest("base64url")
  return { Authorization: `Bearer ${payload}.${signature}` }
}
