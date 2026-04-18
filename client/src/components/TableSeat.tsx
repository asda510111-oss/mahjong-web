import Tile from './Tile'
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
}

const SEAT_AVATARS = [catAvatar, pandaAvatar, foxAvatar, bearAvatar] as const
const SEAT_AVATAR_ALT = ['貓', '熊貓', '狐狸', '熊'] as const

export default function TableSeat({
  position, player, seat, publicState, isDealer, isTurn, isMe, score,
}: Props) {
  const handCount = publicState?.handCount ?? 0
  const melds = publicState?.melds ?? []
  const avatar = SEAT_AVATARS[seat]

  return (
    <div className={`table-seat pos-${position} ${isTurn ? 'turn' : ''} ${isMe ? 'me' : ''}`}>
      <div className="seat-card">
        <div className="avatar"><img src={avatar} alt={SEAT_AVATAR_ALT[seat]} /></div>
        <div className="seat-text">
          <div className="seat-name">
            {player.name}{player.isBot && ' 🤖'}
          </div>
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
