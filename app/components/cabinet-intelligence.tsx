"use client"

import { useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import { ArrowRight, CheckCircle2, ChevronDown, ChevronRight, FilePlus2, FolderOpen, Info, Layers3, RefreshCw, ShieldAlert, XCircle } from "lucide-react"
import { GroundedQuery } from "./grounded-query"
import { TakeoffWorkspace } from "./takeoff-workspace"

type ReviewPackage = { id: string; package_sha: string; gate_open: boolean; scorecard: { denominator: number; exact: number; exact_pct: number; target_met: boolean } }
type Project = { id: string; name: string; mode: string; sources: { id: string; name: string }[] }
type Mapping = { mapping_id: string; unit_label: string; sheet_id: string; pdf_page: number; index_designation: string; unit_count: number; benchmark_rows: number; verified: boolean; checks: Record<string, boolean>; evidence: { kind: string; detail: string }[]; decision: { decision: string; actor: string } | null }
type ObjectRow = { object_id: string; takeoff_id: string; unit_type: string; sheet_id: string; pdf_page: number; run: string; position: number; engine_width_in: string | number | null; status: string; exception_ids: string }
type Review = { id: string; package_sha: string; scorecard: ReviewPackage["scorecard"]; mappings: Mapping[]; status_counts: Record<string, number>; exceptions: { category: string; meaning: string; count: number }[]; gate: { can_approve: boolean; blockers: string[]; verification: { ok: boolean; checks: { check: string; ok: boolean; detail: string }[] } }; meta: { source_pdf?: { pages: number }; two_bedroom_finding?: { conclusion: string } }; takeoff_approval: { actor: string; ts: string } | null }

async function read<T>(path: string): Promise<T> {
  const res = await fetch(`/api/internal/${path}`, { cache: "no-store" })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

const stateTone = (s: string) => s === "EXACT" ? "ci-good" : s === "WIDTH-ONLY" || s === "PARTIAL" ? "ci-warn" : "ci-open"

export function CabinetIntelligence() {
  const [auth, setAuth] = useState<boolean | null>(null)
  const [authConfigured, setAuthConfigured] = useState(false)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loginError, setLoginError] = useState("")
  const [packages, setPackages] = useState<ReviewPackage[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [selected, setSelected] = useState("")
  const [review, setReview] = useState<Review | null>(null)
  const [objects, setObjects] = useState<ObjectRow[]>([])
  const [filter, setFilter] = useState("ALL")
  const [expanded, setExpanded] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<"review" | "projects" | "takeoff">("review")
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    fetch("/api/auth", { cache: "no-store" }).then(async r => {
      const status = await r.json(); setAuth(r.ok && status.authenticated); setAuthConfigured(Boolean(status.configured))
    }).catch(() => { setAuth(false); setAuthConfigured(false) })
  }, [])
  const signIn = async (e: FormEvent) => {
    e.preventDefault(); setLoginError("")
    const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) })
    if (!response.ok) { setLoginError((await response.json()).error ?? "Sign-in failed"); return }
    setPassword(""); setAuth(true); setRefresh(n => n + 1)
  }
  const signOut = async () => { await fetch("/api/auth", { method: "DELETE" }); setAuth(false); setReview(null); setObjects([]); setProjects([]); setPackages([]) }
  useEffect(() => {
    if (!auth) return
    let live = true
    Promise.all([read<ReviewPackage[]>("source-review"), read<Project[]>("projects")])
      .then(([p, j]) => { if (!live) return; setPackages(p); setProjects(j); setSelected(v => v || p[0]?.id || ""); setError("") })
      .catch(e => { if (live) setError(e.message) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [refresh, auth])
  useEffect(() => {
    if (!selected || !auth) return
    let live = true
    Promise.all([read<Review>(`source-review/${selected}`), read<ObjectRow[]>(`source-review/${selected}/objects`)])
      .then(([r, o]) => { if (live) { setReview(r); setObjects(o); setError("") } })
      .catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [selected, refresh, auth])

  const filtered = useMemo(() => filter === "ALL" ? objects : objects.filter(o => o.status === filter), [objects, filter])
  const scores = review?.scorecard
  const held = scores ? scores.denominator - scores.exact : 0

  if (auth !== true) return <main className="ci-login"><div className="ci-login-card"><div className="ci-mark">S<span>.</span></div><small>SNRG LABS · POWERED BY AEON</small><h1>AEON Cabinet Intelligence</h1><p>Private construction intelligence workspace. Source documents, project records and takeoffs are only available after internal sign-in.</p>
    {auth === null ? <p>Checking internal session…</p> : !authConfigured ? <div className="ci-error" role="alert">Internal login is unavailable on this deployment. No project data has been loaded.</div> : <form onSubmit={signIn}><label>Username<input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required /></label><label>Password<input value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" type="password" required /></label><button type="submit">Enter workspace →</button>{loginError && <div className="ci-error" role="alert">{loginError}</div>}</form>}
    <small>Internal only. No customer-ready bid or automatic submission.</small></div></main>

  return <div className="ci-shell">
    <aside className="ci-rail" aria-label="Product navigation">
      <div className="ci-mark">S<span>.</span></div>
      <div className="ci-rail-label">SNRG<br />LABS</div>
      <div className="ci-rail-divider" />
      <button className={view === "review" ? "ci-rail-button selected" : "ci-rail-button"} onClick={() => setView("review")} title="Drawing intelligence" aria-label="Drawing intelligence"><Layers3 size={19} /></button>
      <button className={view === "projects" ? "ci-rail-button selected" : "ci-rail-button"} onClick={() => setView("projects")} title="Projects" aria-label="Projects"><FolderOpen size={19} /></button>
      <button className={view === "takeoff" ? "ci-rail-button selected" : "ci-rail-button"} onClick={() => setView("takeoff")} title="New takeoff" aria-label="New takeoff"><FilePlus2 size={19} /></button>
      <div className="ci-rail-bottom">AEON<br />CORE</div>
    </aside>
    <main className="ci-main">
      <header className="ci-topbar">
        <div className="ci-brand"><strong>Cabinet Intelligence</strong><span>by SNRG Labs</span></div>
        <div className="ci-top-actions"><span className="ci-internal">INTERNAL REVIEW</span><button onClick={() => { setLoading(true); setRefresh(v => v + 1) }} aria-label="Refresh data" title="Refresh data"><RefreshCw size={17} /></button><button onClick={signOut} aria-label="Sign out" title="Sign out" className="ci-signout">Sign out</button></div>
      </header>
      <div className="ci-content">
        <div className="ci-eyebrow">DRAWING → TAKEOFF → EVIDENCE <span> / </span> POWERED BY AEON</div>
        <div className="ci-heading"><div><h1>{view === "review" ? "Know what the drawings actually say." : view === "projects" ? "Project sources" : "Read the actual plans."}</h1><p>{view === "review" ? "Source-verified cabinet intelligence. No guessed quantities, no silent substitutions." : view === "projects" ? "Existing projects from the LangGraph harness. Inventory is not a completed takeoff." : "Create a project, upload the drawing set, then run the existing checkpointed takeoff graph."}</p></div></div>
        {error && <div className="ci-error" role="alert"><XCircle size={17} /> {error} — the public site cannot access private bid data. Run the internal server to review projects.</div>}
        {loading && !review && <div className="ci-panel">Connecting to the existing LangGraph harness…</div>}
        {view === "takeoff" ? <TakeoffWorkspace /> : view === "projects" ? <section className="ci-panel" aria-label="Project inventory">
          <div className="ci-panel-head"><div><small>LIVE HARNESS INVENTORY</small><h2>Projects <em>{projects.length}</em></h2></div><span className="ci-muted">Read-only · sourced from /api/projects</span></div>
          <div className="ci-project-grid">{projects.map(p => <div className="ci-project" key={p.id}><FolderOpen size={18} /><div><strong>{p.name}</strong><span>{p.mode} · {p.sources?.length ?? 0} inventoried source{p.sources?.length === 1 ? "" : "s"}</span></div>{packages.some(x => x.id === p.id) && <button onClick={() => { setSelected(p.id); setView("review") }}>Review <ArrowRight size={14} /></button>}</div>)}</div>
          {projects.length === 0 && !loading && <p className="ci-muted">No projects returned. Check the internal API status.</p>}
        </section> : <>
          <div className="ci-selection"><div><span className="ci-label">REVIEW PACKAGE</span><select aria-label="Select review package" value={selected} onChange={e => { setSelected(e.target.value); setFilter("ALL"); setExpanded("") }}>{packages.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}</select></div>{review && <span className="ci-source-hash">SOURCE LOCK · {review.package_sha.slice(0, 12)}</span>}</div>
          {review && <>
            <GroundedQuery key={review.package_sha} rows={objects} />
            <div className="ci-stats">
              <div className="ci-stat"><span>EXACT CLASSIFICATIONS</span><div><strong>{scores?.exact}</strong><small> / {scores?.denominator}</small></div><p>Function + width verified</p></div>
              <div className="ci-stat"><span>HELD FOR REVIEW</span><div><strong>{held}</strong></div><p>Never promoted into a bid</p></div>
              <div className="ci-stat"><span>DRAWING IDENTITY</span><div><strong>{review.mappings.filter(m => m.verified).length}</strong><small> / {review.mappings.length}</small></div><p>Sheet and unit mappings checked</p></div>
              <div className="ci-stat ci-stat-status"><span>RELEASE GATE</span><div>{scores?.target_met && review.gate.can_approve ? <b className="ci-status ci-good">OPEN</b> : <b className="ci-status ci-warn">HELD</b>}</div><p>{scores?.exact_pct}% exact · no customer release</p></div>
            </div>
            <div className="ci-section-grid">
              <section className="ci-panel" aria-label="Source mapping"><div className="ci-panel-head"><div><small>01 / COMPLETE DRAWING CONTEXT</small><h2>Source identity</h2></div><span className={review.gate.verification.ok ? "ci-status ci-good" : "ci-status ci-warn"}>{review.gate.verification.ok ? "MACHINE CHECKS PASS" : "CHECKS FAILED"}</span></div>
                <p className="ci-panel-intro">Printed title blocks + A002 register + cross-sheet references. A PDF page number is never assumed to be a sheet number.</p>
                <div className="ci-mappings">{review.mappings.map(m => <div key={m.mapping_id}>
                  <button className="ci-mapping" aria-expanded={expanded === m.mapping_id} onClick={() => setExpanded(expanded === m.mapping_id ? "" : m.mapping_id)}><span className="ci-mapping-sheet">{m.sheet_id}<small>PDF {m.pdf_page}</small></span><span className="ci-mapping-name"><strong>{m.index_designation}</strong><small>{m.unit_label} · {m.unit_count} location{m.unit_count === 1 ? "" : "s"} · {m.benchmark_rows} positions</small></span><span className={m.verified ? "ci-dot good" : "ci-dot bad"} title={m.verified ? "verified" : "unverified"} />{expanded === m.mapping_id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                  {expanded === m.mapping_id && <div className="ci-evidence"><div>{m.evidence.map((e, i) => <p key={i}><b>{e.kind.replaceAll("_", " ")}</b> · {e.detail}</p>)}</div><img src={`/api/internal/source-review/${review.id}/page/${m.pdf_page}`} alt={`Original PDF page ${m.pdf_page}, ${m.sheet_id}`} loading="lazy" /><small>Original source rendering · not an AI recreation</small></div>}
                </div>)}</div>
              </section>
              <section className="ci-panel ci-context" aria-label="Review conditions"><div className="ci-panel-head"><div><small>02 / RELEASE CONTROL</small><h2>What is still unresolved</h2></div><ShieldAlert size={19} /></div>
                <div className="ci-context-callout"><Info size={18} /><div><strong>Not a customer-ready bid.</strong><p>The selected project benchmark has {scores?.exact} exact matches across {scores?.denominator} positions. Remaining positions stay exceptions, not purchasable quantities.</p></div></div>
                {review.exceptions.filter(e => e.category !== "EXACT").map(e => <div className="ci-exception" key={e.category}><div><span className={`ci-status ${stateTone(e.category)}`}>{e.category}</span><strong>{e.count}</strong></div><p>{e.meaning}</p></div>)}
                <div className="ci-checklist"><h3>Gate checks</h3>{review.gate.verification.checks.map(c => <p key={c.check}>{c.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}<span>{c.check.replaceAll("_", " ")}</span></p>)}</div>
              </section>
            </div>
            <section className="ci-panel ci-positions" aria-label="Cabinet positions"><div className="ci-panel-head"><div><small>03 / PERSISTENT OBJECT IDENTITIES</small><h2>Cabinet positions <em>{filtered.length}</em></h2></div><span className="ci-muted">Source → run → ordered position</span></div>
              <div className="ci-filters" role="group" aria-label="Filter takeoff status"><button className={filter === "ALL" ? "active" : ""} onClick={() => setFilter("ALL")}>All {scores?.denominator}</button>{Object.entries(review.status_counts).map(([s, n]) => <button key={s} className={filter === s ? "active" : ""} onClick={() => setFilter(s)}>{s.replaceAll("-", " ")} {n}</button>)}</div>
              <div className="ci-table-wrap"><table><thead><tr><th>ID</th><th>UNIT / AREA</th><th>SOURCE</th><th>RUN</th><th>POSITION</th><th>ENGINE FINDING</th><th>STATUS</th></tr></thead><tbody>{filtered.map(o => <tr key={o.object_id}><td><code>{o.takeoff_id}</code></td><td>{o.unit_type}</td><td>{o.sheet_id} · p{o.pdf_page}</td><td>{o.run}</td><td>{o.position}</td><td>{o.engine_width_in ?? "—"}</td><td><span className={`ci-status ${stateTone(o.status)}`}>{o.status}</span></td></tr>)}</tbody></table></div>
            </section>
          </>}
        </>}
        <footer className="ci-footer"><span>© SNRG LABS</span><span>Cabinet Intelligence · Powered by AEON</span><span>Internal evidence workspace · external submission disabled</span></footer>
      </div>
    </main>
  </div>
}
