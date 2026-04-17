import { useState } from 'react'
import type { ConnectionStatus } from '../net/ws'

interface Props {
  status: ConnectionStatus
  onCreateRoom: (name: string) => void
  onJoinRoom: (name: string, code: string) => void
  onQuickMatch: (name: string) => void
}

export default function MainMenu({ status, onCreateRoom, onJoinRoom, onQuickMatch }: Props) {
  const [name, setName] = useState(() => {
    return localStorage.getItem('mahjong_name') ?? `玩家${Math.floor(Math.random() * 9000 + 1000)}`
  })
  const [code, setCode] = useState('')

  const saveName = (v: string) => {
    setName(v)
    localStorage.setItem('mahjong_name', v)
  }

  const busy = status !== 'connected'

  return (
    <div className="menu">
      <h1><span className="emoji">🀄</span>台灣麻將</h1>
      <div className="subtitle">Online · 16 張 · 支援 AI 補位</div>

      <div className="menu-card">
        <label className="muted" style={{ fontSize: '0.9rem' }}>暱稱</label>
        <input
          value={name}
          onChange={(e) => saveName(e.target.value)}
          maxLength={12}
          style={{ letterSpacing: 'normal', textTransform: 'none' }}
          placeholder="你的名字"
        />

        <button disabled={busy || !name.trim()} onClick={() => onCreateRoom(name.trim())}>
          建立房間
        </button>

        <button disabled={busy || !name.trim()} onClick={() => onQuickMatch(name.trim())}>
          快速配對
        </button>

        <div className="row">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
            maxLength={4}
            placeholder="房號"
          />
          <button
            disabled={busy || !name.trim() || code.length !== 4}
            onClick={() => onJoinRoom(name.trim(), code)}
          >
            加入
          </button>
        </div>

        <div className="menu-status">
          {status === 'connecting' && '連線中...'}
          {status === 'disconnected' && <span className="error">未連線（請確認伺服器已啟動）</span>}
          {status === 'connected' && <span className="muted">已連線伺服器 ✓</span>}
        </div>
      </div>
    </div>
  )
}
