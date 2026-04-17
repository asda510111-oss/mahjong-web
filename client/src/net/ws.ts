import type { ClientMessage, ServerMessage } from '../game/types'

type Handler = (msg: ServerMessage) => void

export class GameClient {
  private ws: WebSocket | null = null
  private handlers: Set<Handler> = new Set()
  private statusHandlers: Set<(status: ConnectionStatus) => void> = new Set()
  private _status: ConnectionStatus = 'disconnected'

  get status(): ConnectionStatus { return this._status }

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // 已經有可用連線就直接 resolve（防止 StrictMode 雙重掛載製造兩條連線）
      if (this.ws) {
        const state = this.ws.readyState
        if (state === WebSocket.OPEN) {
          resolve()
          return
        }
        if (state === WebSocket.CONNECTING) {
          this.ws.addEventListener('open', () => resolve(), { once: true })
          this.ws.addEventListener('error', () => reject(new Error('WS error')), { once: true })
          return
        }
      }
      this.setStatus('connecting')
      const ws = new WebSocket(url)
      this.ws = ws
      ws.onopen = () => {
        this.setStatus('connected')
        resolve()
      }
      ws.onmessage = (ev) => {
        try {
          const msg: ServerMessage = JSON.parse(ev.data)
          this.handlers.forEach((h) => h(msg))
        } catch (e) {
          console.error('[WS] parse error', e, ev.data)
        }
      }
      ws.onclose = () => {
        // 只有在 this.ws 仍是當前這個 socket 時才清掉狀態
        // 避免 StrictMode 雙重掛載時，舊 socket 的 close 把新 socket 誤清
        if (this.ws === ws) {
          this.setStatus('disconnected')
          this.ws = null
        }
      }
      ws.onerror = (ev) => {
        console.error('[WS] error', ev)
        if (this.ws === ws) {
          this.setStatus('disconnected')
        }
        reject(new Error('WebSocket connection failed'))
      }
    })
  }

  send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WS] send while not open, dropping:', msg)
      return
    }
    this.ws.send(JSON.stringify(msg))
  }

  onMessage(fn: Handler): () => void {
    this.handlers.add(fn)
    return () => this.handlers.delete(fn)
  }

  onStatusChange(fn: (s: ConnectionStatus) => void): () => void {
    this.statusHandlers.add(fn)
    fn(this._status)
    return () => this.statusHandlers.delete(fn)
  }

  close(): void {
    this.ws?.close()
  }

  private setStatus(s: ConnectionStatus) {
    this._status = s
    this.statusHandlers.forEach((h) => h(s))
  }
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

// 決定連線 URL：
// - 開發：ws://<host>:8080
// - 生產：wss://<same-host>/ws  (由 Netlify/Render 反向代理設定；實際部署再調)
export function resolveServerUrl(): string {
  const envUrl = (import.meta.env?.VITE_WS_URL as string | undefined) ?? ''
  if (envUrl) return envUrl
  const { hostname, protocol } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // 強制用 127.0.0.1 避開 Windows 上 localhost 先解析成 IPv6 ::1 的問題
    return `ws://127.0.0.1:8080`
  }
  // LAN 測試：手機透過電腦 IP 連進來，WebSocket 伺服器也在同一台電腦 port 8080
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:'
  // 若是部署版本（有 https），走 /ws 反代；否則開發模式直接連 8080
  if (protocol === 'https:') {
    return `${wsProto}//${hostname}/ws`
  }
  return `${wsProto}//${hostname}:8080`
}

// 單例（App 層使用）
export const gameClient = new GameClient()
