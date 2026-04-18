import Tile from './Tile'
import type { TileId } from '../game/tiles'
import type { SeatIndex } from '../game/types'

interface Props {
  wallRemaining: number
  dealerLabel: string
  topDiscards: TileId[]
  leftDiscards: TileId[]
  rightDiscards: TileId[]
  botDiscards: TileId[]
  highlightTile?: TileId | null
  glowSeat?: SeatIndex | null      // 全場最近一次打牌的座位
  topSeat?: SeatIndex
  leftSeat?: SeatIndex
  rightSeat?: SeatIndex
  bottomSeat?: SeatIndex
}

function SidewaysTile({ id, highlight, glow, direction }: {
  id: TileId; highlight: boolean; glow: boolean; direction: 'left' | 'right'
}) {
  return (
    <div className={`tile-slot-side tile-slot-${direction}`}>
      <Tile id={id} disabled highlight={highlight} glow={glow} />
    </div>
  )
}

export default function CenterArea({
  wallRemaining = 0,
  dealerLabel = '',
  topDiscards = [],
  leftDiscards = [],
  rightDiscards = [],
  botDiscards = [],
  highlightTile = null,
  glowSeat = null,
  topSeat,
  leftSeat,
  rightSeat,
  bottomSeat,
}: Partial<Props>) {
  const isHi = (t: TileId) => !!highlightTile && t === highlightTile
  // 只有全場最新一家的最後一張才 glow
  const isGlow = (seat: SeatIndex | undefined, idx: number, len: number) =>
    glowSeat !== null && glowSeat === seat && idx === len - 1

  return (
    <div className="center-cross">
      <div className="cd cd-top">
        {topDiscards.map((t, i) => (
          <Tile key={`${t}-${i}`} id={t} disabled
            highlight={isHi(t)}
            glow={isGlow(topSeat, i, topDiscards.length)} />
        ))}
      </div>
      <div className="cd cd-left">
        {leftDiscards.map((t, i) => (
          <SidewaysTile key={`${t}-${i}`} id={t}
            highlight={isHi(t)}
            glow={isGlow(leftSeat, i, leftDiscards.length)}
            direction="left" />
        ))}
      </div>
      <div className="cd-info">
        <div className="center-round">{dealerLabel}</div>
        <div className="wall-frame">
          <div className="wall wall-top" />
          <div className="wall wall-left" />
          <div className="wall-center">
            <div className="center-wall-num">{wallRemaining}</div>
            <div className="center-wall-label">剩餘</div>
          </div>
          <div className="wall wall-right" />
          <div className="wall wall-bottom" />
        </div>
      </div>
      <div className="cd cd-right">
        {rightDiscards.map((t, i) => (
          <SidewaysTile key={`${t}-${i}`} id={t}
            highlight={isHi(t)}
            glow={isGlow(rightSeat, i, rightDiscards.length)}
            direction="right" />
        ))}
      </div>
      <div className="cd cd-bot">
        {botDiscards.map((t, i) => (
          <Tile key={`${t}-${i}`} id={t} disabled
            highlight={isHi(t)}
            glow={isGlow(bottomSeat, i, botDiscards.length)} />
        ))}
      </div>
    </div>
  )
}
