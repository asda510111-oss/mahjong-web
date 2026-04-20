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
  highlightTile = null,
  glowSeat = null,
  bottomSeat,
}: Partial<Props>) {
  const isHi = (t: TileId) => !!highlightTile && t === highlightTile
  const isGlow = (idx: number, len: number) =>
    glowSeat !== null && glowSeat === bottomSeat && idx === len - 1

  return (
    <div className="center-cross">
      <div className="cd-bot">
        {botDiscards.map((t, i) => (
          <Tile
            key={`${t}-${i}`}
            id={t}
            disabled
            highlight={isHi(t)}
            glow={isGlow(i, botDiscards.length)}
          />
        ))}
      </div>
    </div>
  )
}
