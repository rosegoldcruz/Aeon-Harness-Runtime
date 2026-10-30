"use client"

import { useCallback, useEffect, useState } from "react"

type ReviewItem = { item_id: string; label: string; conflicts: string[]; project_qty: number | null; review: { decision: string; actor: string } | null }
type Review = { takeoff_sha256: string; approved_count: number; items: ReviewItem[] }
type Estimate = { estimate_sha256: string; customer_ready: boolean; blockers: string[]; matches: { item_id: string; sku: string; quantity: number; fit: string; price_source: string }[]; ledger: { subtotal_cents: number | null; tax_cents: number | null; total_cents: number | null } }
type Workbook = { artifact_id: string; download: string; recalculated: boolean }
type Calculation = { reconciled: boolean; native_total_cents: number | null; download: string; formula_errors: unknown[]; blockers: string[] }
type History = { estimates: { estimate_sha256: string; subtotal_cents: number | null }[]; workbooks: { workbook: string; output_sha256: string }[]; reviews: unknown[] }

async function api<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(`/api/internal/${path}`, { cache: "no-store", ...(body ? { method: "POST", headers: { "Content-Type": "application/json", "X-Aeon-Action": "1" }, body: JSON.stringify(body) } : {}) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
  return data as T
}
const money = (value: number | null) => value == null ? "unresolved" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100)
const download = (value: string) => value.replace(/^\/api\//, "/api/internal/")

export function BidWorkflow({ jobId, selectedItemId }: { jobId: string; selectedItemId?: string }) {
  const [review, setReview] = useState<Review | null>(null)
  const [note, setNote] = useState("")
  const [margin, setMargin] = useState("15")
  const [address, setAddress] = useState("")
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [workbook, setWorkbook] = useState<Workbook | null>(null)
  const [calculation, setCalculation] = useState<Calculation | null>(null)
  const [history, setHistory] = useState<History | null>(null)
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const refresh = useCallback(async () => {
    const [r, h] = await Promise.all([api<Review>(`takeoffs/${jobId}/review`), api<History>(`takeoffs/${jobId}/history`)])
    setReview(r); setHistory(h)
  }, [jobId])
  useEffect(() => { refresh().catch(e => setError(e.message)) }, [refresh])
  const act = async (label: string, task: () => Promise<void>) => {
    setBusy(label); setError("")
    try { await task(); await refresh() }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Operation failed") }
    finally { setBusy("") }
  }
  const item = review?.items.find(i => i.item_id === selectedItemId)
  const decide = (decision: "approve" | "reject") => act("Saving review", async () => {
    if (!review || !item) throw new Error("Inspect an item above before reviewing it")
    await api(`takeoffs/${jobId}/review`, { takeoff_sha256: review.takeoff_sha256, item_id: item.item_id, decision, actor: "Internal reviewer", note })
    setEstimate(null); setWorkbook(null); setCalculation(null); setNote("")
  })
  const price = () => act("Matching real catalog and pricing", async () => {
    if (!review) throw new Error("Load the reviewed takeoff first")
    const percent = Number(margin)
    if (!Number.isFinite(percent) || percent < 1 || percent > 50) throw new Error("Enter a gross margin between 1% and 50%")
    const policy = await api<{ purchase_factors: object[] }>("catalogs/hci-shaker/policy")
    const value = await api<Estimate>(`takeoffs/${jobId}/estimate`, {
      takeoff_sha256: review.takeoff_sha256, catalog_id: "hci-shaker", construction: "plywood", product_family: "framed",
      config: { project_id: jobId, project_address: address || null, supplier: "hci", series: "shaker", finish: "White Shaker",
        gross_margin: { value: String(percent / 100), approval_ref: "Internal estimator explicitly requested this margin" },
        purchase_factors: policy.purchase_factors },
    })
    setEstimate(value); setWorkbook(null); setCalculation(null)
  })
  return <section className="ci-panel" aria-label="Catalog and original workbook workflow">
    <div className="ci-panel-head"><div><small>REAL CATALOG · ORIGINAL WORKBOOK</small><h2>3. Review, price and verify</h2></div><span className="ci-status ci-warn">INTERNAL SCOPE</span></div>
    <p className="ci-panel-intro">{review?.approved_count ?? 0} source-backed item(s) approved. Inspect an item above, record a decision, then price confirmed scope. Cabinet identity, completeness and customer release remain separate gates.</p>
    {item ? <div className="ci-context-callout"><div><strong>{item.label} · {item.project_qty ?? "unresolved"} project quantity</strong><p>{item.review ? `${item.review.decision} by ${item.review.actor}` : "Awaiting review"}</p><label>Review explanation<textarea aria-label="Review explanation" value={note} onChange={e => setNote(e.target.value)} maxLength={2000} /></label><div className="flex gap-3"><button className="ci-primary" disabled={!!busy || !note.trim() || !!item.conflicts.length} onClick={() => decide("approve")}>Confirm selected item</button><button disabled={!!busy || !note.trim()} onClick={() => decide("reject")}>Reject selected item</button></div>{item.conflicts.length > 0 && <p>Conflicting source evidence must be corrected before confirmation.</p>}</div></div> : <p className="ci-muted">Use “Inspect source” on a candidate line to review it here.</p>}
    <div className="ci-form-grid"><label>Gross margin (%)<input aria-label="Gross margin percent" type="number" min="1" max="50" step="1" value={margin} onChange={e => setMargin(e.target.value)} /></label><label>Delivery address<input aria-label="Delivery address" value={address} onChange={e => setAddress(e.target.value)} placeholder="Tax stays unresolved without sourced tax treatment" /></label></div>
    <p className="ci-muted">Selected sourced catalog: HCI Shaker · White Shaker · plywood framed cabinets. Other manufacturers require their own verified geometry and price records.</p>
    <button className="ci-primary" disabled={!!busy || !review?.approved_count} onClick={price}>Match HCI SKUs & calculate estimate</button>
    {busy && <p role="status">{busy}…</p>}{error && <div className="ci-error" role="alert">{error}</div>}
    {estimate && <><h3>Independent pricing ledger</h3><p>Priced subtotal: <strong>{money(estimate.ledger.subtotal_cents)}</strong> · Tax: {money(estimate.ledger.tax_cents)} · Total: {money(estimate.ledger.total_cents)}</p>
      <div className="ci-table-wrap"><table><thead><tr><th>ACTUAL SKU</th><th>QUANTITY</th><th>FIT</th><th>PRICE SOURCE</th></tr></thead><tbody>{estimate.matches.map(m => <tr key={m.item_id}><td>{m.sku}</td><td>{m.quantity}</td><td>{m.fit}</td><td>{m.price_source}</td></tr>)}</tbody></table></div>
      <details><summary>Unresolved scope and release blockers ({estimate.blockers.length})</summary>{estimate.blockers.map(b => <p key={b}>{b}</p>)}</details>
      <button className="ci-primary" disabled={!!busy} onClick={() => act("Populating original V6", async () => { setWorkbook(await api<Workbook>(`takeoffs/${jobId}/workbook`, { estimate_sha256: estimate.estimate_sha256, allow_partial: true })); setCalculation(null) })}>Create internal partial workbook</button>
    </>}
    {workbook && <div className="ci-context-callout"><div><p>{calculation ? "Original inputs retained; verified calculation result is shown below." : "Original V6 inputs populated. Calculation has not yet been verified."}</p><a href={download(workbook.download)}>Download native workbook</a><br /><button className="ci-primary" disabled={!!busy} onClick={() => act("Recalculating original formulas and comparing totals", async () => setCalculation(await api<Calculation>(`takeoffs/${jobId}/recalculate`, { artifact_id: workbook.artifact_id })))}>Recalculate & compare totals</button></div></div>}
    {calculation && <div className="ci-context-callout"><div><strong>{calculation.reconciled ? "Workbook and cent ledger agree" : "Pricing discrepancy — release held"}</strong><p>Original workbook total before separately sourced tax: {money(calculation.native_total_cents)} · Formula errors: {calculation.formula_errors.length}</p><a href={download(calculation.download)}>Download recalculated original workbook</a><p>Incomplete scope remains internal. No proposal, email or order has been released.</p></div></div>}
    {history && <details><summary>Retained history: {history.reviews.length} reviews, {history.estimates.length} estimates, {history.workbooks.length} workbooks</summary>{history.estimates.map(h => <p key={h.estimate_sha256}>Estimate {h.estimate_sha256.slice(0, 12)} · {money(h.subtotal_cents)}</p>)}{history.workbooks.map(w => <p key={w.output_sha256}>Workbook {w.output_sha256.slice(0, 12)}</p>)}</details>}
  </section>
}
