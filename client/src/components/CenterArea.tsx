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

// 四家棄牌堆已移除，等待重建
export default function CenterArea(_props: Partial<Props>) {
  return <div className="center-cross" />
}
