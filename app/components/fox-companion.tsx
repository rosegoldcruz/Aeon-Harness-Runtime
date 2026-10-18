"use client"

import { useEffect, useRef, useState } from "react"
import { FoxViewport } from "./fox-viewport"

/** Dispatch this event when the harness has an answer to speak. Audio wins over text. */
export type AeonSpeech = { text: string; audioUrl?: string }

export default function FoxCompanion() {
  const [open, setOpen] = useState(false)
  const [walking, setWalking] = useState(true)
  const [text, setText] = useState("I'm Aeon. Your fox is online and ready to walk with you.")
  const [status, setStatus] = useState("Ready")
  const mouth = useRef(0)
  const speaking = useRef(false)
  const stop = useRef<() => void>(() => {})
  const play = useRef<(detail: AeonSpeech) => void>(() => {})

  useEffect(() => {
    let audio: HTMLAudioElement | undefined
    let context: AudioContext | undefined
    let frame = 0
    let utterance: SpeechSynthesisUtterance | undefined
    let alive = true
    let session = 0
    const finish = () => {
      speaking.current = false
      mouth.current = 0
      cancelAnimationFrame(frame)
      if (alive) setStatus("Ready")
    }
    stop.current = () => {
      session += 1
      audio?.pause()
      audio = undefined
      if (utterance) { window.speechSynthesis?.cancel(); utterance = undefined }
      void context?.close().catch(() => {})
      context = undefined
      finish()
    }
    play.current = (detail) => {
      stop.current()
      if (!detail || typeof detail.text !== "string") return
      if (!detail.text?.trim() && !detail.audioUrl) return
      const activeSession = session
      const active = () => alive && session === activeSession
      setOpen(true)
      if (detail.text) setText(detail.text)
      setStatus("Starting voice…")
      if (detail.audioUrl) {
        audio = new Audio()
        audio.crossOrigin = "anonymous"
        audio.src = detail.audioUrl
        context = new AudioContext()
        const analyser = context.createAnalyser()
        analyser.fftSize = 256
        context.createMediaElementSource(audio).connect(analyser)
        analyser.connect(context.destination)
        const samples = new Uint8Array(analyser.fftSize)
        const animate = () => {
          analyser.getByteTimeDomainData(samples)
          let sum = 0
          for (const value of samples) sum += ((value - 128) / 128) ** 2
          mouth.current = Math.min(1, Math.sqrt(sum / samples.length) * 5)
          frame = requestAnimationFrame(animate)
        }
        audio.onended = () => { if (active()) finish() }
        audio.onerror = () => { if (active()) { finish(); setStatus("Couldn't play this audio. Try again.") } }
        const currentAudio = audio
        void context.resume().then(() => { if (active()) return currentAudio.play() }).then(() => {
          if (!active()) return
          speaking.current = true
          setStatus("Speaking · audio driven mouth")
          animate()
        }).catch(() => { if (active()) { finish(); setStatus("Press Speak to allow audio playback.") } })
      } else if ("speechSynthesis" in window) {
        utterance = new SpeechSynthesisUtterance(detail.text)
        utterance.rate = 0.96
        utterance.onstart = () => {
          if (!active()) return
          speaking.current = true
          setStatus("Speaking · browser voice")
          const animate = (time: number) => {
            // Browser voices do not expose PCM audio. This is an approximate speech motion.
            mouth.current = 0.15 + Math.abs(Math.sin(time * 0.018) * Math.cos(time * 0.007)) * 0.8
            frame = requestAnimationFrame(animate)
          }
          frame = requestAnimationFrame(animate)
        }
        utterance.onend = () => { if (active()) finish() }
        utterance.onerror = (event) => {
          if (!active()) return
          finish()
          if (event.error !== "canceled" && event.error !== "interrupted") setStatus("Voice unavailable. Try your browser's voice settings.")
        }
        window.speechSynthesis.speak(utterance)
      } else setStatus("This browser doesn't support speech. Use an audio response.")
    }
    const onSpeech = (event: Event) => play.current((event as CustomEvent<AeonSpeech>).detail)
    window.addEventListener("aeon:speak", onSpeech)
    return () => {
      alive = false
      window.removeEventListener("aeon:speak", onSpeech)
      stop.current()
    }
  }, [])

  return (
    <>
      <FoxViewport kind="body" walking={walking} mouth={mouth} speaking={speaking} />
      <div className="fixed bottom-5 right-4 z-[60] flex flex-col items-end gap-3 sm:right-6">
        {open && (
          <section aria-label="Aeon Fox voice" className="w-[min(340px,calc(100vw-32px))] overflow-hidden rounded-3xl border border-rose-200/70 bg-background/95 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between px-5 pt-4">
              <div><h2 className="text-sm font-semibold">Aeon Fox</h2><p className="text-[11px] text-muted-foreground">Your companion</p></div>
              <button aria-label="Close fox voice" className="rounded-full px-3 py-2 text-muted-foreground hover:bg-muted" onClick={() => { stop.current(); setOpen(false) }}>×</button>
            </div>
            <FoxViewport kind="head" walking={false} mouth={mouth} speaking={speaking} />
            <div className="space-y-3 px-5 pb-5">
              <label htmlFor="fox-speech" className="text-xs font-medium">Let Aeon say something</label>
              <textarea id="fox-speech" maxLength={2000} rows={2} value={text} onChange={event => setText(event.target.value)} className="w-full resize-none rounded-xl border bg-muted/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-400" />
              <div className="flex gap-2">
                <button onClick={() => play.current({ text })} disabled={!text.trim()} className="flex-1 rounded-xl bg-foreground px-3 py-2 text-xs font-medium text-background disabled:opacity-40">Speak</button>
                <button onClick={() => stop.current()} className="rounded-xl border px-3 py-2 text-xs">Stop</button>
                <button onClick={() => setWalking(value => !value)} className="rounded-xl border px-3 py-2 text-xs">{walking ? "Pause walk" : "Walk"}</button>
              </div>
              <p aria-live="polite" className="text-[11px] text-muted-foreground">{status}</p>
              <div className="flex gap-4 text-[11px] text-muted-foreground">
                <a className="underline underline-offset-4" href="/models/aeon-fox-full-body.glb" download>Full body GLB ↓</a>
                <a className="underline underline-offset-4" href="/models/aeon-fox-head.glb" download>Head GLB ↓</a>
              </div>
            </div>
          </section>
        )}
        <button onClick={() => { if (open) stop.current(); setOpen(!open) }} aria-expanded={open} className="flex items-center gap-2 rounded-full border border-rose-200 bg-background px-4 py-3 text-xs font-medium shadow-lg hover:bg-rose-50">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Talk to Aeon
        </button>
      </div>
    </>
  )
}
