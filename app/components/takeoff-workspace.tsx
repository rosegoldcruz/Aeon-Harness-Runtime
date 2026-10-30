"use client"

import { useCallback, useEffect, useState } from "react"
import { FilePlus2, FileText, Play, ShieldAlert } from "lucide-react"
import { BidWorkflow } from "./bid-workflow"

type Job = { job_id: string; profile: string; project?: { name: string; general_contractor: string; description: string } | null; sources: { name: string }[]; complete: boolean }
type Status = { job_id: string; project?: Job["project"]; status: string; running: boolean; error?: string | null; complete: boolean; pages_read: number; pages_relevant: number; progress: { node: string; message: string }[] }
type Item = { item_id: string; unit_type: string | null; room: string | null; label: string; category: string; cabinet_type?: string; width: { value_in: number | null; basis: string; evidence?: Item["evidence"] }; height: { value_in: number | null; basis: string }; depth: { value_in: number | null; basis: string }; project_qty: number | null; confidence: string; conflicts: string[]; evidence: { file: string; page: number; sheet: string | null; bbox?: number[]; crop?: string; quote?: string }[] }
type Takeoff = { items: Item[]; unresolved: string[]; unit_types: { name: string; repetition: { count: number | null; basis: string }; project_cabinets: number | null }[]; reading: { pages_read: number; vision_enabled: boolean } }

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/internal/${path}`, { cache: "no-store", ...options })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
  return data as T
}
const post = (path: string, body: object) => api<{ job_id: string }>(path, { method: "POST", headers: { "Content-Type": "application/json", "X-Aeon-Action": "1" }, body: JSON.stringify(body) })
const dim = (d: Item["width"]) => d?.value_in == null ? `unresolved (${d?.basis ?? "missing"})` : `${d.value_in}″ (${d.basis})`

export function TakeoffWorkspace() {
  const [jobs, setJobs] = useState<Job[]>([])
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

  const selectJob = (next: string) => { setTakeoff(null); setSelectedItem(null); setStatus(null); setJobId(next) }

  const reload = useCallback(async () => {
    const [j, p] = await Promise.all([api<Job[]>("takeoffs"), api<Record<string, string>>("takeoff-profiles")])
    setJobs(j); setProfiles(p)
  }, [])
  useEffect(() => { reload().catch(e => setMessage(e.message)) }, [reload])
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
        else if (s.running) timer = setTimeout(poll, 1500)
      } catch (e: unknown) { if (alive) setMessage(e instanceof Error ? e.message : "Takeoff status failed") }
    }
    setTakeoff(null); setSelectedItem(null); poll()
    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [jobId, pollVersion])

  const create = async () => {
    setMessage("")
    if (!name.trim() || !gc.trim() || !description.trim()) { setMessage("Project name, GC and description are required."); return }
    if (!plans?.length) { setMessage("Select at least one actual architectural PDF."); return }
    const source = [...plans, ...Array.from(addenda ?? [])]
    if (source.some(f => !f.name.toLowerCase().endsWith(".pdf") || f.size > 160 * 1024 * 1024 || !f.size)) { setMessage("Only nonempty PDF plans/addenda up to 160 MiB each are supported. Specifications need a separate document route and are not silently treated as plans."); return }
    setBusy(true)
    try {
      const job = await post("takeoffs", { profile, project: { name, general_contractor: gc, description } })
      for (const file of source) {
        const kind = Array.from(addenda ?? []).includes(file) ? "addendum" : "plan"
        await api(`takeoffs/${job.job_id}/files`, { method: "POST", headers: { "Content-Type": "application/pdf", "X-Aeon-Action": "1", "X-File-Name": encodeURIComponent(file.name), "X-Source-Kind": kind }, body: file })
      }
      await reload(); selectJob(job.job_id)
      setMessage(`${source.length} file(s) stored under project ${name}. Review sources, then run the takeoff explicitly. No external model, quote or email has been invoked.`)
    } catch (e: unknown) { setMessage(e instanceof Error ? e.message : "Upload failed") }
    finally { setBusy(false) }
  }
  const run = async () => {
    if (!jobId) return
    setBusy(true); setMessage("")
    try { await post(`takeoffs/${jobId}/run`, {}); setTakeoff(null); setSelectedItem(null); setPollVersion(n => n + 1); setMessage("Existing checkpointed drawing reader started. Results stay preliminary and held for review.") }
    catch (e: unknown) { setMessage(e instanceof Error ? e.message : "Analysis failed") }
    finally { setBusy(false) }
  }

  return <div className="ci-takeoff">
    <section className="ci-panel"><div className="ci-panel-head"><div><small>NEW INTERNAL PROJECT</small><h2>1. Register a drawing package</h2></div><FilePlus2 size={20} /></div>
      <p className="ci-panel-intro">This uses the existing LangGraph takeoff job store and reading profile. Files stay on the server. No proposal can be sent from this screen.</p>
      <div className="ci-form-grid"><label>Project name<input aria-label="Project name" value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder="TEST Fixture Court" /></label><label>General contractor<input aria-label="General contractor" value={gc} onChange={e => setGc(e.target.value)} maxLength={120} placeholder="TEST GC" /></label><label className="ci-wide">Description<textarea aria-label="Project description" value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} placeholder="Drawing set and scope notes" /></label><label>Architectural PDF plans<input aria-label="Architectural PDF plans" type="file" accept="application/pdf" multiple onChange={e => setPlans(e.target.files)} /></label><label>Addenda (in issue order)<input aria-label="Drawing addenda" type="file" accept="application/pdf" multiple onChange={e => setAddenda(e.target.files)} /></label><label>Reading profile<select aria-label="Reading profile" value={profile} onChange={e => setProfile(e.target.value)}>{Object.entries(profiles).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label></div>
      <button className="ci-primary" onClick={create} disabled={busy}>{busy ? "Storing drawings…" : "Create project & upload plans"}</button>
      <p className="ci-muted">Specification uploads are not yet supported by this graph. We won't misclassify them as plans.</p>
    </section>
    <section className="ci-panel"><div className="ci-panel-head"><div><small>CHECKPOINTED LANGGRAPH</small><h2>2. Analyze and inspect</h2></div><ShieldAlert size={20} /></div>
      <label className="ci-job-select">Project job<select aria-label="Select takeoff job" value={jobId} onChange={e => selectJob(e.target.value)}><option value="">Select stored job…</option>{jobs.map(j => <option key={j.job_id} value={j.job_id}>{j.project?.name ?? j.job_id} · {j.sources?.length ?? 0} PDF(s){j.complete ? " · read complete" : ""}</option>)}</select></label>
      {status && <div className="ci-job-status"><span className="ci-status ci-warn">{status.status.toUpperCase()} · PRELIMINARY</span><p>{status.project?.name ?? jobId} · {status.pages_read}/{status.pages_relevant} relevant pages read</p>{status.error && <div className="ci-error">{status.error}</div>}{status.progress?.slice(-5).map((x,i) => <small key={i}>{x.node}: {x.message}<br /></small>)}
        {!status.complete && !status.running && <button className="ci-primary" onClick={run} disabled={busy || !jobs.find(j => j.job_id === jobId)?.sources?.length}>{busy ? "Starting…" : "Analyze drawings"}</button>}
      </div>}
      {message && <div className="ci-context-callout" role="status"><FileText size={17} /><span>{message}</span></div>}
      {takeoff && <><div className="ci-context-callout"><ShieldAlert size={17} /><span>Drawing read finished, not a verified bid. {takeoff.items.length} candidate line(s); {takeoff.unresolved.length} unresolved finding(s). SKU fit, install scope, workbook, and proposal are still gated.</span></div>
        <h3>Unit mix from source</h3><div className="ci-unit-grid">{takeoff.unit_types.map((u,i) => <div key={i}><strong>{u.name ?? "Unassigned"}</strong><span>Printed repetition: {u.repetition.count ?? "unresolved"} · Project cabinets: {u.project_cabinets ?? "unresolved"}</span></div>)}</div>
        <h3>Unresolved findings</h3><div className="ci-findings">{takeoff.unresolved.slice(0,30).map((x,i) => <p key={i}>{x}</p>)}{takeoff.unresolved.length > 30 && <p>+ {takeoff.unresolved.length - 30} more retained in the takeoff record</p>}</div>
        <h3>Candidate cabinet lines</h3><div className="ci-table-wrap"><table><thead><tr><th>UNIT</th><th>ROOM</th><th>CABINET</th><th>WIDTH</th><th>PROJECT QTY</th><th>EVIDENCE</th></tr></thead><tbody>{takeoff.items.map(item => <tr key={item.item_id}><td>{item.unit_type ?? "—"}</td><td>{item.room ?? "—"}</td><td><strong>{item.label}</strong><br /><small>{item.cabinet_type ?? item.category} · {item.confidence}</small></td><td>{dim(item.width)}</td><td>{item.project_qty ?? "unresolved"}</td><td><button className="ci-evidence-button" onClick={() => setSelectedItem(item)}>Inspect source</button></td></tr>)}</tbody></table></div>
        {selectedItem && <div className="ci-item-evidence"><button className="ci-dismiss" onClick={() => setSelectedItem(null)}>Close</button><h3>{selectedItem.item_id}</h3><p>W {dim(selectedItem.width)} · H {dim(selectedItem.height)} · D {dim(selectedItem.depth)}</p>{selectedItem.conflicts?.map((c,i) => <p key={i} className="ci-error">{c}</p>)}{[...(selectedItem.width.evidence ?? []), ...selectedItem.evidence].filter((ev, index, all) => all.findIndex(other => other.crop === ev.crop) === index).map((ev,i) => <div key={i}><p>{ev.file} · {ev.sheet ?? "unresolved sheet"} · PDF p{ev.page} · bbox {ev.bbox?.join(", ") ?? "not recorded"}</p><blockquote>{ev.quote}</blockquote>{ev.crop && <img src={`/api/internal/takeoffs/${jobId}/artifact?path=${encodeURIComponent(ev.crop)}`} alt={`Source evidence for ${selectedItem.item_id}`} loading="lazy" />}</div>)}</div>}
      </>}
    </section>
    {takeoff && <BidWorkflow key={jobId} jobId={jobId} selectedItemId={selectedItem?.item_id} />}
  </div>
}
