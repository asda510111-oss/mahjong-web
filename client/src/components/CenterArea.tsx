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
  glowSeat?: SeatIndex | null
  topSeat?: SeatIndex
  leftSeat?: SeatIndex
  rightSeat?: SeatIndex
  bottomSeat?: SeatIndex
}

export default function CenterArea({
  botDiscards = [],
  topDiscards = [],
  rightDiscards = [],
  highlightTile = null,
  glowSeat = null,
  bottomSeat,
  topSeat,
  rightSeat,
}: Partial<Props>) {
  const isHi = (t: TileId) => !!highlightTile && t === highlightTile
  const isGlow = (seat: SeatIndex | undefined, idx: number, len: number) =>
    glowSeat !== null && glowSeat === seat && idx === len - 1

  return (
    <div className="center-cross">
      <div className="cd-bot">
        {botDiscards.map((t, i) => (
          <Tile
            key={`${t}-${i}`}
            id={t}
            disabled
            highlight={isHi(t)}
            glow={isGlow(bottomSeat, i, botDiscards.length)}
          />
        ))}
      </div>
      <div className="cd-top">
        {topDiscards.map((t, i) => (
          <Tile
            key={`${t}-${i}`}
            id={t}
            disabled
            highlight={isHi(t)}
            glow={isGlow(topSeat, i, topDiscards.length)}
          />
        ))}
      </div>
      <div className="cd-right">
        {rightDiscards.map((t, i) => (
          <Tile
            key={`${t}-${i}`}
            id={t}
            disabled
            highlight={isHi(t)}
            glow={isGlow(rightSeat, i, rightDiscards.length)}
          />
        ))}
      </div>
    </div>
  )
}
