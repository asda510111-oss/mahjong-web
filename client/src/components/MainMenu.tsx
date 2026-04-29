import { useState } from 'react'
import type { ConnectionStatus } from '../net/ws'
import catAvatar from '../assets/avatars/cat.svg'
import pandaAvatar from '../assets/avatars/panda.svg'
import foxAvatar from '../assets/avatars/fox.svg'
import bearAvatar from '../assets/avatars/bear.svg'

const AVATARS = [catAvatar, pandaAvatar, foxAvatar, bearAvatar]

interface Props {
  status: ConnectionStatus
  profile?: { name: string; avatar: 0|1|2|3; score: number } | null
  onLogout?: () => void
  onCreateRoom: (name: string) => void
  onJoinRoom: (name: string, code: string) => void
  onQuickMatch?: (name: string) => void
  onListRooms: (name: string) => void
  roomList: Array<{ code: string; players: number; hostName: string }> | null
  onCloseRoomList: () => void
}

export default function MainMenu({
  status, profile, onLogout,
  onCreateRoom, onJoinRoom, onListRooms, roomList, onCloseRoomList,
}: Props) {
  const [name, setName] = useState(() => {
    if (profile) return profile.name
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
      <div className="menu-header">
        <h1><span className="emoji">🀄</span>台灣麻將</h1>
        <div className="subtitle">
          {status === 'connecting' && '連線中...'}
          {status === 'disconnected' && <span className="error">未連線（請確認伺服器已啟動）</span>}
          {status === 'connected' && <span className="muted">已連線伺服器 ✓</span>}
        </div>
      </div>

      <div className="menu-cols">
        {profile && (
          <aside className="menu-profile-side">
            <img className="profile-avatar big" src={AVATARS[profile.avatar]} alt="" />
            <div className="profile-name">{profile.name}</div>
            <div className="profile-score">現有點數：{profile.score}</div>
            <button className="profile-logout" onClick={onLogout}>登出</button>
          </aside>
        )}

        {!profile && (
          <div className="menu-card">
            <label className="muted" style={{ fontSize: '0.9rem' }}>暱稱</label>
            <input
              value={name}
              onChange={(e) => saveName(e.target.value)}
              maxLength={12}
              style={{ letterSpacing: 'normal', textTransform: 'none' }}
              placeholder="你的名字"
            />
          </div>
        )}

        <button
          className="menu-action-card create"
          disabled={busy || !name.trim()}
          onClick={() => onCreateRoom(name.trim())}
        >
          <div className="menu-action-icon">＋</div>
          <div className="menu-action-label">建立房間</div>
        </button>

        <button
          className="menu-action-card find"
          disabled={busy || !name.trim()}
          onClick={() => onListRooms(name.trim())}
        >
          <div className="menu-action-icon">🔍</div>
          <div className="menu-action-label">尋找房間</div>
        </button>
      </div>

      {/* 房間清單彈窗 */}
      {roomList !== null && (
        <div className="room-list-overlay" onClick={onCloseRoomList}>
          <div className="room-list-panel" onClick={(e) => e.stopPropagation()}>
            <div className="room-list-header">
              <h3>可加入的房間</h3>
              <button className="room-list-close" onClick={onCloseRoomList}>✕</button>
            </div>
            <div className="room-list-top-row">
              <button onClick={() => onListRooms(name.trim())}>↻ 重新整理</button>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
                maxLength={4}
                placeholder="輸入房號"
              />
              <button
                disabled={busy || !name.trim() || code.length !== 4}
                onClick={() => onJoinRoom(name.trim(), code)}
              >
                加入
              </button>
            </div>
            {roomList.length === 0 ? (
              <div className="room-list-empty">目前沒有等待中的房間</div>
            ) : (
              <div className="room-list-items">
                {roomList.map((r) => (
                  <div key={r.code} className="room-list-item">
                    <div className="room-list-info">
                      <div className="room-list-sub">房主：{r.hostName} · {r.players}/4</div>
                    </div>
                    <button onClick={() => onJoinRoom(name.trim(), r.code)}>加入</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
