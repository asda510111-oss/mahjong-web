import { useState } from 'react'
import type { ConnectionStatus } from '../net/ws'

interface Props {
  status: ConnectionStatus
  error: string
  onLogin: (name: string, password: string) => void
}

export default function AuthScreen({ status, error, onLogin }: Props) {
  const [name, setName] = useState('')
  const [pw, setPw] = useState('')
  const busy = status !== 'connected'

  return (
    <div className="menu auth-menu">
      <h1><span className="emoji">🀄</span>台灣麻將</h1>

      <div className="menu-card">
        <label className="muted" style={{ fontSize: '0.9rem' }}>暱稱</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.trim())}
          maxLength={16}
          placeholder="你的帳號"
          style={{ letterSpacing: 'normal', textTransform: 'none' }}
        />

        <label className="muted" style={{ fontSize: '0.9rem' }}>密碼</label>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          maxLength={32}
          placeholder="密碼"
        />

        <button
          disabled={busy || !name || !pw}
          onClick={() => onLogin(name, pw)}
        >
          登入
        </button>

        {error && <div className="error" style={{ textAlign: 'center' }}>{error}</div>}

        <div className="menu-status">
          {status === 'connecting' && '連線中...'}
          {status === 'disconnected' && <span className="error">未連線</span>}
          {status === 'connected' && <span className="muted">已連線伺服器 ✓</span>}
        </div>
      </div>
    </div>
  )
}
