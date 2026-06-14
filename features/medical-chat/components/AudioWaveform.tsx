// Live recording waveform — visual feedback while the mic is capturing.
//
// Taps the existing recording MediaStream (react-media-recorder's
// previewAudioStream — NOT a second getUserMedia, which can fail or echo on
// iOS) through a Web Audio AnalyserNode and animates a row of bars. Bars are
// mutated directly via refs in a requestAnimationFrame loop, so there's no
// React re-render per frame.
"use client"

import { useEffect, useRef } from "react"

const BAR_COUNT = 28
const IDLE_SCALE = 0.12

export function AudioWaveform({
  stream,
  className,
}: {
  stream: MediaStream | null
  className?: string
}) {
  const barsRef = useRef<Array<HTMLSpanElement | null>>([])
  const rafRef = useRef<number | null>(null)

  // The MediaStream object identity churns (react-media-recorder rebuilds it
  // every render), but the underlying track is stable for a recording session.
  // Key the analyser setup on the track id so it runs once per session.
  const trackId = stream?.getAudioTracks()[0]?.id ?? null

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) return

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return

    let cancelled = false
    const bars = barsRef.current // stable array; React mutates its elements in place
    const audioCtx = new AudioCtx()
    const source = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 64
    analyser.smoothingTimeConstant = 0.8
    source.connect(analyser) // analyser only — never to destination (no feedback)
    const data = new Uint8Array(analyser.frequencyBinCount)

    // Autoplay policy can leave the context suspended until resumed.
    void audioCtx.resume?.()

    const draw = () => {
      if (cancelled) return
      analyser.getByteFrequencyData(data)
      for (let i = 0; i < bars.length; i++) {
        const el = bars[i]
        if (!el) continue
        const v = data[Math.floor((i / bars.length) * data.length)] / 255
        el.style.transform = `scaleY(${Math.max(IDLE_SCALE, v)})`
      }
      rafRef.current = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      source.disconnect()
      analyser.disconnect()
      void audioCtx.close().catch(() => {})
      // Reset bars to the idle line for the next session.
      bars.forEach((el) => {
        if (el) el.style.transform = `scaleY(${IDLE_SCALE})`
      })
    }
    // trackId is the stable key for this stream; `stream` identity churns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId])

  return (
    <div className={`flex items-center justify-center gap-[3px] ${className ?? ""}`} aria-hidden="true">
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el
          }}
          className="h-5 w-[3px] origin-center rounded-full bg-primary/80"
          style={{ transform: `scaleY(${IDLE_SCALE})` }}
        />
      ))}
    </div>
  )
}
