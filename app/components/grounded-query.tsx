"use client"

import { useState } from "react"
import { ArrowUpRight, Search } from "lucide-react"

type Row = { takeoff_id: string; unit_type: string; sheet_id: string; pdf_page: number; run: string; status: string }
type Answer = { heading: string; body: string; cited: Row[]; warning: string }

function lookup(question: string, rows: Row[]): Answer {
  const q = question.toLowerCase().trim()
  const sheet = q.match(/\b[a-z]{1,3}-?\d{3}(?:\.\d+)?[a-z]?\b/i)?.[0].toUpperCase()
  let cited: Row[] = []
  let heading = ""
  if (sheet) { cited = rows.filter(r => r.sheet_id === sheet); heading = `Positions sourced from ${sheet}` }
  else if (/unresolved|missing|exception|held|open/.test(q)) { cited = rows.filter(r => r.status !== "EXACT"); heading = "Positions held for review" }
  else if (/exact|verified|confirmed/.test(q)) { cited = rows.filter(r => r.status === "EXACT"); heading = "Exact function + width matches" }
  else if (rows.some(row => row.unit_type && q.includes(row.unit_type.toLowerCase()))) {
    const unit = [...new Set(rows.map(row => row.unit_type).filter(Boolean))].sort((a,b) => b.length-a.length).find(name => q.includes(name.toLowerCase()))!
    cited = rows.filter(row => row.unit_type === unit); heading = `Positions for ${unit}`
  }
  else return { heading: "No verified answer for that question", body: "This index can retrieve source sheets, unit types and review status. It cannot answer cabinet specifications, SKU fit or pricing from these records. No answer was invented.", cited: [], warning: "Try a sheet ID, an indexed unit type, or unresolved positions." }
  return { heading, body: `${cited.length} indexed positions. ${cited.filter(r => r.status === "EXACT").length} exact; ${cited.filter(r => r.status !== "EXACT").length} held. This is a source-index lookup, not a new cabinet classification.`, cited, warning: "Only exact positions have verified function + width. All other findings remain exceptions." }
}

export function GroundedQuery({ rows }: { rows: Row[] }) {
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState<Answer | null>(null)
  const ask = (value: string) => { setQuestion(value); setAnswer(lookup(value, rows)) }
  return <section className="ci-query" aria-label="Query indexed drawing evidence">
    <div className="ci-panel-head"><div><small>INDEXED EVIDENCE / NO GUESSES</small><h2>Ask the drawings.</h2></div><span className="ci-muted">Deterministic retrieval · no model call</span></div>
    <form onSubmit={e => { e.preventDefault(); if (question.trim()) ask(question) }} className="ci-query-form"><Search size={19} /><input aria-label="Question about drawing evidence" placeholder="Ask about a source sheet, indexed unit type or unresolved positions…" value={question} onChange={e => setQuestion(e.target.value)} /><button type="submit" aria-label="Search evidence"><ArrowUpRight size={18} /></button></form>
    {!answer && <div className="ci-query-chips">{[...new Set(rows.map(row => row.sheet_id).filter(Boolean))].slice(0, 2).map(sheet => `Show ${sheet}`).concat("Unresolved positions").map(s => <button key={s} onClick={() => ask(s)}>{s}</button>)}</div>}
    {answer && <div className="ci-answer" role="status"><h3>{answer.heading}</h3><p>{answer.body}</p><small>{answer.warning}</small>{answer.cited.length > 0 && <div className="ci-citations">{answer.cited.slice(0, 12).map(r => <span key={r.takeoff_id}><b>{r.takeoff_id}</b> · {r.sheet_id} PDF p{r.pdf_page} · {r.run} · {r.status}</span>)}{answer.cited.length > 12 && <em>+ {answer.cited.length - 12} more in the position index below</em>}</div>}</div>}
  </section>
}
