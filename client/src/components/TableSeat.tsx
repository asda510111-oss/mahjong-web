import { useEffect, useState } from 'react'
import Tile from './Tile'
import type { PublicPlayerState, PlayerInfo, SeatIndex } from '../game/types'
import { SEAT_LABELS } from '../game/types'

type Position = 'top' | 'left' | 'right' | 'bottom'

interface Props {
  position: Position
  player: PlayerInfo
  seat: SeatIndex
  publicState?: PublicPlayerState
  isDealer: boolean
  isTurn: boolean
  isMe: boolean
  turnTimer: { seat: SeatIndex; thinkMs: number; baseMs: number; startAt: number } | null
}

const SEAT_AVATARS = ['🦁', '🐼', '🦊', '🐻'] as const

// 倒數元件：先扣思考時間（綠），再扣基礎時間（紅）
function CountdownDisplay({ thinkMs, baseMs, startAt }: { thinkMs: number; baseMs: number; startAt: number }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 200)
    return () => clearInterval(id)
  }, [])
  const elapsed = Math.max(0, Date.now() - startAt)
  let remain: number
  let phase: 'think' | 'base'
  if (elapsed < thinkMs) {
    remain = (thinkMs - elapsed) / 1000
    phase = 'think'
  } else {
    const baseElapsed = elapsed - thinkMs
    remain = Math.max(0, (baseMs - baseElapsed) / 1000)
    phase = 'base'
  }
  const display = Math.ceil(remain)
  return (
    <div className={`turn-timer ${phase}`}>
      {display}
    </div>
  )
}

export default function TableSeat({
  position, player, seat, publicState, isDealer, isTurn, isMe, turnTimer,
}: Props) {
  const handCount = publicState?.handCount ?? 0
  const melds = publicState?.melds ?? []
  const avatar = SEAT_AVATARS[seat]

  return (
    <div className={`table-seat pos-${position} ${isTurn ? 'turn' : ''} ${isMe ? 'me' : ''}`}>
      <div className="seat-card">
        <div className="avatar">
          {avatar}
          {isTurn && turnTimer && (
            <CountdownDisplay
              thinkMs={turnTimer.thinkMs}
              baseMs={turnTimer.baseMs}
              startAt={turnTimer.startAt}
            />
          )}
        </div>
        <div className="seat-text">
          <div className="seat-name">
            {player.name}{player.isBot && ' 🤖'}
          </div>
          <div className="seat-sub">
            <span className="seat-wind">{SEAT_LABELS[seat]}{isDealer && ' 莊'}</span>
            {!isMe && <span className="muted"> · {handCount}張</span>}
            {!player.isConnected && <span className="muted"> · 離線</span>}
          </div>
        </div>
      </div>

      {!isMe && handCount > 0 && (
        <div className="seat-backs">
          {Array.from({ length: handCount }).map((_, i) => (
            <div key={i} className="tile back compact" />
          ))}
        </div>
      )}

      {melds.length > 0 && (
        <div className="seat-melds">
          {melds.map((m, mi) => (
            <div key={mi} className={`meld-group ${m.type === 'flower' ? 'flower' : ''}`}>
              {m.tiles.map((t, ti) => (
                <Tile key={`${t}-${ti}`} id={t} disabled />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
