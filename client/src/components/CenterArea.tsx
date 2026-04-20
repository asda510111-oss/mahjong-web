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

  // 四家棄牌堆已移除，等待重建
  void isHi; void isGlow
  return <div className="center-cross" />
}
