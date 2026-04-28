import { useEffect, useState } from 'react'
import type { PublicPlayerState, PlayerInfo, SeatIndex } from '../game/types'
import { SEAT_LABELS } from '../game/types'
import catAvatar from '../assets/avatars/cat.svg'
import pandaAvatar from '../assets/avatars/panda.svg'
import foxAvatar from '../assets/avatars/fox.svg'
import bearAvatar from '../assets/avatars/bear.svg'

type Position = 'top' | 'left' | 'right' | 'bottom'

interface Props {
  position: Position
  player: PlayerInfo
  seat: SeatIndex
  publicState?: PublicPlayerState
  isDealer: boolean
  isTurn: boolean
  isMe: boolean
  score: number | null
  delta?: number | null  // 本局得失分（觸發飄字動畫）
}

const SEAT_AVATARS = [catAvatar, pandaAvatar, foxAvatar, bearAvatar] as const
const SEAT_AVATAR_ALT = ['貓', '熊貓', '狐狸', '熊'] as const

export default function TableSeat({
  position, player, seat, publicState, isDealer, isTurn, isMe, score, delta = null,
}: Props) {
  const handCount = publicState?.handCount ?? 0
  const avatar = SEAT_AVATARS[seat]
  // delta 飄字動畫：當 delta 變化時顯示一段時間後消失
  const [showDelta, setShowDelta] = useState<number | null>(null)
  useEffect(() => {
    if (delta === null || delta === 0) {
      setShowDelta(null)
      return
    }
    setShowDelta(delta)
    const t = setTimeout(() => setShowDelta(null), 1800)
    return () => clearTimeout(t)
  }, [delta])

  return (
    <div className={`table-seat pos-${position} ${isTurn ? 'turn' : ''} ${isMe ? 'me' : ''}`}>
      <div className="seat-card">
        <div className="avatar"><img src={avatar} alt={SEAT_AVATAR_ALT[seat]} /></div>
        <div className="seat-text">
          <div className="seat-name">
            {player.name}{player.isBot && ' 🤖'}
          </div>
          {publicState?.accountScore !== undefined && (
            <div className="seat-account-score">
              {publicState.accountScore} 點
              {showDelta !== null && (
                <span key={showDelta} className={`score-delta ${showDelta >= 0 ? 'pos' : 'neg'}`}>
                  {showDelta >= 0 ? '+' : ''}{showDelta}
                </span>
              )}
            </div>
          )}
          <div className="seat-sub">
            <span className="seat-wind">{SEAT_LABELS[seat]}{isDealer && ' 莊'}</span>
            {!isMe && <span className="muted"> · {handCount}張</span>}
            {!player.isConnected && <span className="muted"> · 離線</span>}
            {score !== null && (
              <span className={`seat-score ${score >= 0 ? 'pos' : 'neg'}`}>
                {' '}{score >= 0 ? '+' : ''}{score}
              </span>
            )}
          </div>
        </div>
      </div>

      {!isMe && handCount > 0 && (
        <div className="seat-backs">
          {(position === 'top' || position === 'right' || position === 'left')
            ? (() => {
                // 對家/下家/上家：固定 17 格位，DOM 左側先隱藏
                // - 對家（未旋轉）：左側=視覺左側，左減少
                // - 下家（rotate 90°）：DOM 左=視覺上方，上減少
                // - 上家（rotate -90°）：DOM 左=視覺下方，下減少
                const MAX = 17
                return Array.from({ length: MAX }).map((_, i) => {
                  const visible = i >= MAX - handCount
                  return (
                    <div
                      key={i}
                      className="tile back compact"
                      style={{ visibility: visible ? 'visible' : 'hidden' }}
                    />
                  )
                })
              })()
            : Array.from({ length: handCount }).map((_, i) => (
                <div key={i} className="tile back compact" />
              ))}
        </div>
      )}

      {/* 舊的副子區 (.seat-melds) 已由 .my-melds / .top-melds / .left-melds / .right-melds 取代 */}
    </div>
  )
}
