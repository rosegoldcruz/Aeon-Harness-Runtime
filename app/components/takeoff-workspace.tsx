"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { FilePlus2, FileText, ShieldAlert } from "lucide-react"
import { BidWorkflow } from "./bid-workflow"

type Job = { job_id: string; profile: string; project?: { name: string; general_contractor: string; description: string } | null; sources: { name: string }[]; complete: boolean }
type Status = { job_id: string; project?: Job["project"]; status: string; lifecycle_status: string; lifecycle_detail: string; lifecycle_artifacts: Record<string, string>; execution_status: string; vision_execution_enabled: boolean; running: boolean; error?: string | null; complete: boolean; pages_read: number; pages_relevant: number; views_completed: number; views_failed: number; progress: { node: string; message: string }[] }
type Item = { item_id: string; unit_type: string | null; room: string | null; label: string; category: string; cabinet_type?: string; width: { value_in: number | null; basis: string; evidence?: Item["evidence"] }; height: { value_in: number | null; basis: string }; depth: { value_in: number | null; basis: string }; project_qty: number | null; confidence: string; conflicts: string[]; evidence: { file: string; page: number; sheet: string | null; bbox?: number[]; crop?: string; quote?: string }[] }
type Takeoff = { items: Item[]; unresolved: string[]; unit_types: { name: string; repetition: { count: number | null; basis: string }; project_cabinets: number | null }[]; reading: { pages_read: number; vision_enabled: boolean } }

type ScheduleRow = { row_id: string; item_id: string; room: string | null; position: number; description: string; doors: number | null; drawers: number | null; dimensions: Record<string, Item["width"]>; manufacturer_sku: string | null; candidate_sku: string | null; observed_quantity_per_unit: number | null; verified_quantity_per_unit: number | null; project_quantity: number | null; status: string; exceptions: string[]; drawing_reference: Item["evidence"][number] }
type Schedule = { artifact_id: string; current: boolean; unit_schedules: { unit_type: string | null; verified_project_occurrences: number | null; status: string; rows: ScheduleRow[] }[]; exceptions: { unit_type: string | null; code: string }[]; document_coverage: { physical_pages_indexed: number; pages_by_role: Record<string, number>; unread_inventory_pages: number; partially_read_inventory_pages: number; source_scope_notes: { file: string; page: number; quote: string }[]; pages: { file: string; page: number; sheet: string; title: string; role: string; reading_status: string }[] } }

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/internal/${path}`, { cache: "no-store", ...options })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
  return data as T
}
const post = (path: string, body: object) => api<{ job_id: string }>(path, { method: "POST", headers: { "Content-Type": "application/json", "X-Aeon-Action": "1" }, body: JSON.stringify(body) })
const dim = (d: Item["width"]) => d?.value_in == null ? `unresolved (${d?.basis ?? "missing"})` : `${d.value_in}″ (${d.basis})`

export function TakeoffWorkspace() {
  const evidencePanel = useRef<HTMLDivElement>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [catalogs, setCatalogs] = useState<{id: string; name: string; available: boolean}[]>([])
  const [catalogId, setCatalogId] = useState("")
  const [specifications, setSpecifications] = useState<FileList | null>(null)
  const [profiles, setProfiles] = useState<Record<string, string>>({})
  const [profile, setProfile] = useState("generic_architectural")
  const [jobId, setJobId] = useState("")
  const [pollVersion, setPollVersion] = useState(0)
  const [status, setStatus] = useState<Status | null>(null)
  const [takeoff, setTakeoff] = useState<Takeoff | null>(null)
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [name, setName] = useState("")
  const [gc, setGc] = useState("")
  const [description, setDescription] = useState("")
  const [plans, setPlans] = useState<FileList | null>(null)
  const [addenda, setAddenda] = useState<FileList | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => { if (selectedItem) { evidencePanel.current?.scrollIntoView({ block: "start" }); evidencePanel.current?.focus({ preventScroll: true }) } }, [selectedItem])

  const selectJob = (next: string) => { setTakeoff(null); setSchedule(null); setSelectedItem(null); setStatus(null); setJobId(next); sessionStorage.setItem("aeon-takeoff-job", next) }

  const reload = useCallback(async () => {
    const [j, p, c] = await Promise.all([api<Job[]>("takeoffs"), api<Record<string, string>>("takeoff-profiles"), api<{id: string; name: string; available: boolean}[]>("catalogs")])
    setJobs(j); setProfiles(p); setCatalogs(c)
  }, [])
  useEffect(() => { reload().catch(e => setMessage(e.message)); setJobId(sessionStorage.getItem("aeon-takeoff-job") ?? "") }, [reload])
  useEffect(() => {
    if (!jobId) return
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const s = await api<Status>(`takeoffs/${jobId}`)
        if (!alive) return
        setStatus(s)
        if (s.complete) { const result = await api<Takeoff>(`takeoffs/${jobId}/takeoff.json`); if (alive) setTakeoff(result) }
        if (s.lifecycle_artifacts?.cabinet_schedule_sha256) { const result = await api<Schedule>(`takeoffs/${jobId}/schedule`); if (alive) setSchedule(result) }
        if (s.running) timer = setTimeout(poll, 1500)
      } catch (e: unknown) { if (alive) setMessage(e instanceof Error ? e.message : "Takeoff status failed") }
    }
    setTakeoff(null); setSchedule(null); setSelectedItem(null); poll()
    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [jobId, pollVersion])

  const create = async () => {
    setMessage("")
    if (!name.trim() || !gc.trim() || !description.trim()) { setMessage("Project name, GC and description are required."); return }
    if (!plans?.length) { setMessage("Select at least one actual architectural PDF."); return }
    const source = [...plans, ...Array.from(addenda ?? []), ...Array.from(specifications ?? [])]
    if (source.some(f => !f.name.toLowerCase().endsWith(".pdf") || f.size > 512 * 1024 * 1024 || !f.size)) { setMessage("Upload nonempty PDF plans, addenda and specifications up to 512 MiB each."); return }
    setBusy(true)
    try {
      const job = await post("takeoffs", { profile, ...(catalogId ? { catalog_id: catalogId } : {}), project: { name, general_contractor: gc, description } })
      selectJob(job.job_id)
      for (const file of source) {
        const kind = Array.from(specifications ?? []).includes(file) ? "specification" : Array.from(addenda ?? []).includes(file) ? "addendum" : "plan"
        await api(`takeoffs/${job.job_id}/files`, { method: "POST", headers: { "Content-Type": "application/pdf", "X-Aeon-Action": "1", "X-File-Name": encodeURIComponent(file.name), "X-Source-Kind": kind }, body: file })
      }
      await reload(); setPollVersion(version => version + 1)
      setMessage(`${source.length} file(s) stored under project ${name}. Click RUN AUTOMATED BID to process this package.`)
    } catch (e: unknown) { setMessage(e instanceof Error ? e.message : "Upload failed") }
    finally { setBusy(false) }
  }
  const run = async () => {
    if (!jobId) return
    setBusy(true); setMessage("")
    try { await post(`takeoffs/${jobId}/${status?.execution_status === "failed" ? "resume" : "automated-bid"}`, {}); setTakeoff(null); setSelectedItem(null); setPollVersion(n => n + 1); setMessage("Automated bid job queued. Progress, source evidence, cabinet schedules and exceptions will appear here.") }
    catch (e: unknown) { setMessage(e instanceof Error ? e.message : "Analysis failed") }
    finally { setBusy(false) }
  }

  return <div className="ci-takeoff">
    <section className="ci-panel"><div className="ci-panel-head"><div><small>NEW INTERNAL PROJECT</small><h2>1. Register a drawing package</h2></div><FilePlus2 size={20} /></div>
      <p className="ci-panel-intro">Create a project and upload the complete plan set, addenda and specifications. Each execution retains its documents, evidence, schedule versions and review history.</p>
      <div className="ci-form-grid"><label>Project name<input aria-label="Project name" value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder="Construction project name" /></label><label>General contractor<input aria-label="General contractor" value={gc} onChange={e => setGc(e.target.value)} maxLength={120} placeholder="General contractor name" /></label><label className="ci-wide">Description<textarea aria-label="Project description" value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} placeholder="Drawing set and scope notes" /></label><label>Architectural PDF plans<input aria-label="Architectural PDF plans" type="file" accept="application/pdf" multiple onChange={e => setPlans(e.target.files)} /></label><label>Addenda (in issue order)<input aria-label="Drawing addenda" type="file" accept="application/pdf" multiple onChange={e => setAddenda(e.target.files)} /></label><label>Specifications<input aria-label="Project specifications" type="file" accept="application/pdf" multiple onChange={e => setSpecifications(e.target.files)} /></label><label>Manufacturer selection<select aria-label="Manufacturer selection" value={catalogId} onChange={e => setCatalogId(e.target.value)}><option value="">Resolve from project requirements</option>{catalogs.filter(c => c.available).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Reading profile<select aria-label="Reading profile" value={profile} onChange={e => setProfile(e.target.value)}>{Object.entries(profiles).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label></div>
      <button className="ci-primary" onClick={create} disabled={busy}>{busy ? "Storing drawings…" : "Create project & upload plans"}</button>
      <p className="ci-muted">Specifications provide scope context. Unconfirmed manufacturer selections and critical drawing uncertainties remain review exceptions.</p>
    </section>
    <section className="ci-panel"><div className="ci-panel-head"><div><small>CHECKPOINTED LANGGRAPH</small><h2>2. Run automated bid</h2></div><ShieldAlert size={20} /></div>
      <label className="ci-job-select">Project job<select aria-label="Select takeoff job" value={jobId} onChange={e => selectJob(e.target.value)}><option value="">Select stored job…</option>{jobs.map(j => <option key={j.job_id} value={j.job_id}>{j.project?.name ?? j.job_id} · {j.sources?.length ?? 0} PDF(s){j.complete ? " · read complete" : ""}</option>)}</select></label>
      {status && <div className="ci-job-status"><span className="ci-status ci-warn">{status.lifecycle_status ?? status.status.toUpperCase()}</span><p>{status.project?.name ?? jobId} · {status.pages_read}/{status.pages_relevant} relevant pages processed · {status.views_completed ?? 0} views read · {status.views_failed ?? 0} failed views</p><p>{status.lifecycle_detail}</p>{!status.vision_execution_enabled && <p className="ci-error">Live drawing interpretation is disabled on this server. Unread physical scope will require review.</p>}{status.error && <div className="ci-error">{status.error}</div>}{status.progress?.slice(-5).map((x,i) => <small key={i}>{x.node}: {x.message}<br /></small>)}
        {!status.running && <button className="ci-primary" onClick={run} disabled={busy || !jobs.find(j => j.job_id === jobId)?.sources?.length}>{busy ? "Starting…" : status.execution_status === "failed" ? "Resume automated bid" : "RUN AUTOMATED BID"}</button>}
      </div>}
      {message && <div className="ci-context-callout" role="status"><FileText size={17} /><span>{message}</span></div>}
      {schedule && <section aria-label="Cabinet schedule by unit type"><h3>Cabinet schedule by unit type</h3><p>{schedule.current ? "Current source version" : "Source or review changed — regenerate schedule"} · {schedule.artifact_id.slice(0, 12)} · {schedule.exceptions.length} explicit exceptions</p><a className="ci-evidence-button" href={`/api/internal/takeoffs/${jobId}/schedule`} download={`cabinet-schedule-${schedule.artifact_id.slice(0,12)}.json`}>Download cabinet schedule (JSON)</a><button className="ci-evidence-button" disabled={busy || status?.running} onClick={async () => { setBusy(true); try { await post(`takeoffs/${jobId}/schedule`, {}); setPollVersion(version => version + 1) } catch (error) { setMessage(error instanceof Error ? error.message : "Schedule refresh failed") } finally { setBusy(false) } }}>Refresh schedule from source reviews</button>
        {schedule.unit_schedules.map((unit,i) => <div key={i}><h3>{unit.unit_type ?? "Unassigned scope"} · {unit.verified_project_occurrences ?? "unresolved"} project occurrences</h3><div className="ci-table-wrap"><table><thead><tr><th>ROOM / POSITION</th><th>CABINET / DIMENSIONS</th><th>MANUFACTURER SKU</th><th>PER UNIT / PROJECT</th><th>SOURCE / STATUS</th></tr></thead><tbody>{unit.rows.map(row => <tr key={row.row_id}><td>{row.room ?? "Unresolved room"} / {row.position}</td><td>{row.description}<br /><small>Doors {row.doors ?? "?"} · Functional drawers {row.drawers ?? "?"}</small><br /><small>W {dim(row.dimensions.width)} · H {dim(row.dimensions.height)} · D {dim(row.dimensions.depth)}</small></td><td>{row.manufacturer_sku ?? "Unresolved"}{!row.manufacturer_sku && row.candidate_sku && <small><br />Candidate: {row.candidate_sku}</small>}</td><td>{row.verified_quantity_per_unit ?? `${row.observed_quantity_per_unit ?? "unassigned scope"} observed`} / {row.project_quantity ?? "unverified"}</td><td>{row.drawing_reference.sheet} · p{row.drawing_reference.page}<br />{row.status}<br /><button className="ci-evidence-button" onClick={() => setSelectedItem(takeoff?.items.find(item => item.item_id === row.item_id) ?? null)}>Inspect source</button>{row.exceptions.length > 0 && <details><summary>{row.exceptions.length} exceptions</summary>{row.exceptions.map(code => <p key={code}>{code}</p>)}</details>}</td></tr>)}</tbody></table></div>{!unit.rows.length && <p className="ci-error">Cabinet scope has not been extracted for this unit.</p>}</div>)}
        <details><summary>Document coverage · {schedule.document_coverage.physical_pages_indexed} physical pages indexed</summary><p>{schedule.document_coverage.unread_inventory_pages} unread inventory pages · {schedule.document_coverage.partially_read_inventory_pages} partially read. Indexing and visual reading do not establish accuracy.</p><div className="ci-table-wrap"><table><thead><tr><th>DOCUMENT / PAGE</th><th>SHEET / TITLE</th><th>SCOPE</th><th>READ STATUS</th></tr></thead><tbody>{schedule.document_coverage.pages.map((p,i) => <tr key={i}><td>{p.file} · p{p.page}</td><td>{p.sheet}<br />{p.title}</td><td>{p.role}</td><td>{p.reading_status}</td></tr>)}</tbody></table></div></details>
        <details><summary>Source installation and accessory notes ({schedule.document_coverage.source_scope_notes.length})</summary>{schedule.document_coverage.source_scope_notes.map((n,i) => <p key={i}>{n.file} · p{n.page}: {n.quote}</p>)}</details>
      </section>}
      {takeoff && <><div className="ci-context-callout"><ShieldAlert size={17} /><span>Drawing read finished, not a verified bid. {takeoff.items.length} candidate line(s); {takeoff.unresolved.length} unresolved finding(s). SKU fit, install scope, workbook, and proposal are still gated.</span></div>
        <h3>Unit mix from source</h3><div className="ci-unit-grid">{takeoff.unit_types.map((u,i) => <div key={i}><strong>{u.name ?? "Unassigned"}</strong><span>Printed repetition: {u.repetition.count ?? "unresolved"} · Project cabinets: {u.project_cabinets ?? "unresolved"}</span></div>)}</div>
        <h3>Unresolved findings</h3><div className="ci-findings">{takeoff.unresolved.slice(0,30).map((x,i) => <p key={i}>{x}</p>)}{takeoff.unresolved.length > 30 && <p>+ {takeoff.unresolved.length - 30} more retained in the takeoff record</p>}</div>
        <h3>Candidate cabinet lines</h3><div className="ci-table-wrap"><table><thead><tr><th>UNIT</th><th>ROOM</th><th>CABINET</th><th>WIDTH</th><th>PROJECT QTY</th><th>EVIDENCE</th></tr></thead><tbody>{takeoff.items.map(item => <tr key={item.item_id}><td>{item.unit_type ?? "—"}</td><td>{item.room ?? "—"}</td><td><strong>{item.label}</strong><br /><small>{item.cabinet_type ?? item.category} · {item.confidence}</small></td><td>{dim(item.width)}</td><td>{item.project_qty ?? "unresolved"}</td><td><button className="ci-evidence-button" onClick={() => setSelectedItem(item)}>Inspect source</button></td></tr>)}</tbody></table></div>
        {selectedItem && <div className="ci-item-evidence" ref={evidencePanel} role="region" aria-label="Drawing evidence" tabIndex={-1} style={{ scrollMarginTop: 96 }}><button className="ci-dismiss" onClick={() => setSelectedItem(null)}>Close</button><h3>{selectedItem.item_id}</h3><p>W {dim(selectedItem.width)} · H {dim(selectedItem.height)} · D {dim(selectedItem.depth)}</p>{selectedItem.conflicts?.map((c,i) => <p key={i} className="ci-error">{c}</p>)}{[...(selectedItem.width.evidence ?? []), ...selectedItem.evidence].filter((ev, index, all) => all.findIndex(other => other.crop === ev.crop) === index).map((ev,i) => <div key={i}><p>{ev.file} · {ev.sheet ?? "unresolved sheet"} · PDF p{ev.page} · bbox {ev.bbox?.join(", ") ?? "not recorded"}</p><blockquote>{ev.quote}</blockquote>{ev.crop && <img src={`/api/internal/takeoffs/${jobId}/artifact?path=${encodeURIComponent(ev.crop)}`} alt={`Source evidence for ${selectedItem.item_id}`} loading="lazy" />}</div>)}</div>}
      </>}
    </section>
    {takeoff && <BidWorkflow key={jobId} jobId={jobId} selectedItemId={selectedItem?.item_id} />}
  </div>
}
