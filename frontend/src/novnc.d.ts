// src/novnc.d.ts — Ambient module declaration for @novnc/novnc
// (no imports here — this must be a "script" file so the declare reaches all files)

declare module '@novnc/novnc/lib/rfb' {
  export default class RFB extends EventTarget {
    constructor(
      target: HTMLElement,
      url: string,
      options?: {
        credentials?: { password?: string }
        wsProtocols?: string[]
      },
    )
    disconnect(): void
    sendCredentials(creds: { password: string }): void
    scaleViewport: boolean
    resizeSession: boolean
    qualityLevel: number
    viewOnly: boolean
  }
}
