// components/raspberry/CameraPane.tsx
import React, { useEffect, useRef } from 'react'
import './CameraPane.css'

interface Props {
  streamUrl: string
  label?: string
  camId?: string
  isActive?: boolean
  isExpanded?: boolean
  onToggleExpand?: () => void
}

const CameraPane: React.FC<Props> = ({ streamUrl, label, camId, isActive = true, isExpanded = false, onToggleExpand }) => {
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (!isActive || !streamUrl || !imgRef.current) return

    const img = imgRef.current
    let blobUrl: string | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    // Timeout helper: resolves {done:true} after ms to unblock a hung reader.read()
    // WebView2 does NOT propagate AbortSignal to ReadableStream when the TCP
    // connection is half-open, so the setInterval watchdog was never unblocking
    // the pending read. Promise.race() per-read is the reliable fix.
    const readOrTimeout = (
      reader: ReadableStreamDefaultReader<Uint8Array>,
      ms: number
    ): Promise<ReadableStreamReadResult<Uint8Array>> =>
      Promise.race([
        reader.read(),
        new Promise<ReadableStreamReadResult<Uint8Array>>(resolve =>
          setTimeout(() => resolve({ done: true, value: undefined }), ms)
        ),
      ])

    // ── Jitter buffer ────────────────────────────────────────────────────────
    // Pinggy (and any internet tunnel) delivers frames in irregular bursts.
    // Rendering each frame immediately produces visible micro-gaps.
    // Solution: queue decoded frames and play them out at a steady rate.
    //   BUFFER_START  – frames pre-loaded before rendering begins  (~120 ms)
    //   BUFFER_MAX    – max queued frames before dropping oldest   (~320 ms)
    //   TARGET_FPS    – render interval (must match server fps)
    const BUFFER_START = 3
    const BUFFER_MAX   = 8
    const TARGET_FPS   = 25

    const frameQueue: Blob[] = []
    let playTimer: ReturnType<typeof setInterval> | null = null

    const startPlayback = () => {
      if (playTimer !== null) return
      playTimer = setInterval(() => {
        if (frameQueue.length === 0) return          // buffer underrun – wait
        const blob = frameQueue.shift()!
        const prev = blobUrl
        blobUrl = URL.createObjectURL(blob)
        img.src = blobUrl
        if (prev) URL.revokeObjectURL(prev)
      }, 1000 / TARGET_FPS)
    }

    const stopPlayback = () => {
      if (playTimer !== null) { clearInterval(playTimer); playTimer = null }
    }

    const enqueue = (blob: Blob) => {
      frameQueue.push(blob)
      // Drop oldest frames if queue is too full (burst catch-up)
      while (frameQueue.length > BUFFER_MAX) {
        frameQueue.shift() // oldest blob GC'd – no URL was created so nothing to revoke
      }
      // Start playback once we have enough buffered
      if (frameQueue.length >= BUFFER_START) startPlayback()
    }

    const connectMjpeg = async () => {
      if (cancelled) return

      // Pause playback during reconnect but keep last displayed frame visible
      stopPlayback()
      // Flush queue but don't clear img.src (keeps last good frame on screen)
      frameQueue.length = 0

      try {
        const controller = new AbortController()
        const response = await Promise.race([
          fetch(streamUrl, { signal: controller.signal }),
          new Promise<never>((_, reject) =>
            setTimeout(() => { controller.abort(); reject(new Error('connect timeout')) }, 8000)
          ),
        ])
        if (!response.body) throw new Error('no body')

        const reader = response.body.getReader()
        let buf = new Uint8Array(0)

        while (true) {
          // 4-second per-read timeout: tolerates ngrok latency bursts without false reconnects
          const { done, value } = await readOrTimeout(reader, 4000)
          if (done || cancelled) break

          const next = new Uint8Array(buf.length + value!.length)
          next.set(buf)
          next.set(value!, buf.length)
          buf = next

          // Limit buffer size to 4 MB to avoid unbounded growth on corrupt streams
          if (buf.length > 4 * 1024 * 1024) { buf = new Uint8Array(0); continue }

          while (buf.length > 3) {
            let soi = -1
            for (let i = 0; i < buf.length - 1; i++) {
              if (buf[i] === 0xFF && buf[i + 1] === 0xD8) { soi = i; break }
            }
            if (soi < 0) { buf = new Uint8Array(0); break }

            let eoi = -1
            for (let i = soi + 2; i < buf.length - 1; i++) {
              if (buf[i] === 0xFF && buf[i + 1] === 0xD9) { eoi = i + 2; break }
            }
            if (eoi < 0) {
              if (soi > 0) buf = buf.slice(soi)
              break
            }

            enqueue(new Blob([buf.slice(soi, eoi)], { type: 'image/jpeg' }))
            buf = buf.slice(eoi)
          }
        }

        reader.cancel().catch(() => {})
      } catch {
        // Connect error or timeout — will retry below
      }

      // Auto-reconnect after 1.5s
      if (!cancelled) {
        retryTimer = setTimeout(connectMjpeg, 1500)
      }
    }

    connectMjpeg()

    return () => {
      cancelled = true
      stopPlayback()
      frameQueue.length = 0
      if (retryTimer) clearTimeout(retryTimer)
      if (blobUrl) URL.revokeObjectURL(blobUrl)
      img.src = ''
    }
  }, [streamUrl, isActive])

  return (
    <div className={`camera-pane ${isExpanded ? 'camera-pane--expanded' : ''}`} onDoubleClick={onToggleExpand}>
      <img
        ref={imgRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
        alt=""
      />
      <div className="camera-controls">
        <div className="camera-status">
          <div className="camera-live-dot" />
          <span>EN VIVO</span>
        </div>
        {label && <span className="camera-label">{label}</span>}
      </div>
      {camId && <div className="camera-id-badge">{camId}</div>}
    </div>
  )
}

export default CameraPane
