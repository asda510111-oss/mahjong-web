import { useEffect, useState } from 'react'
import Tile from './Tile'
import type { TileId } from '../game/tiles'
import { sortHand } from '../game/tiles'
import type { Meld, TaiResult } from '../game/rules'
import { SEAT_LABELS, type SeatIndex } from '../game/types'

interface Props {
  winnerSeat: SeatIndex
  winnerName: string
  loserSeat?: SeatIndex
  loserName?: string
  winTile: TileId
  tai: TaiResult
  hand: TileId[]
  melds: Meld[]
  base?: number
  taiPt?: number
  zimoRake?: number
  onClose: () => void
}

export default function HuResult({
  winnerSeat, winnerName, loserSeat, loserName, winTile, tai, hand, melds,
  base = 200, taiPt = 50, zimoRake = 0,
  onClose,
}: Props) {
  // 10 秒倒數（與 server 階段 1 timer 同步），歸零自動關閉
  const [secondsLeft, setSecondsLeft] = useState(10)
  useEffect(() => {
    const startAt = Date.now()
    const tick = setInterval(() => {
      const left = Math.max(0, 10 - Math.floor((Date.now() - startAt) / 1000))
      setSecondsLeft(left)
      if (left <= 0) {
        clearInterval(tick)
        onClose()
      }
    }, 200)
    return () => clearInterval(tick)
  }, [onClose])
  // 將手牌排序但把胡牌那張放到最右
  const withoutWin = (() => {
    const idx = hand.indexOf(winTile)
    if (idx < 0) return hand
    return [...hand.slice(0, idx), ...hand.slice(idx + 1)]
  })()
  const sorted = sortHand(withoutWin)
  const isZimo = loserSeat === undefined
  const taiPoints = tai.total * taiPt
  const points = base + taiPoints

  return (
    <div className="hu-overlay" onClick={onClose}>
      <div className="hu-panel" onClick={(e) => e.stopPropagation()}>
        <div className="hu-title">
          🎉 {SEAT_LABELS[winnerSeat]}家 {winnerName} 胡牌！
        </div>
        <div className="hu-subtitle">
          {isZimo ? '自摸' : `${SEAT_LABELS[loserSeat!]}家 ${loserName ?? ''} 放炮`}
        </div>

        {/* 胡牌手牌展示 */}
        <div className="hu-hand">
          {sorted.map((t, i) => <Tile key={`${t}-${i}`} id={t} disabled />)}
          <div style={{ width: '10px' }} />
          <div className="hu-wintile"><Tile id={winTile} disabled /></div>
        </div>

        {/* 副子 */}
        {melds.length > 0 && (
          <div className="hu-melds">
            {melds.map((m, mi) => (
              <div key={mi} className={`meld-group ${m.type === 'flower' ? 'flower' : ''}`}>
                {m.tiles.map((t, ti) => <Tile key={`${t}-${ti}`} id={t} disabled />)}
              </div>
            ))}
          </div>
        )}

        {/* 台數明細 */}
        <div className="hu-tai-list">
          <div className="hu-row base">
            <span>底</span><span>{base}</span>
          </div>
          {tai.items.length === 0 && (
            <div className="hu-row muted"><span>（無台）</span><span>0</span></div>
          )}
          {tai.items.map((item, i) => (
            <div key={i} className="hu-row">
              <span>{item.name}</span>
              <span>+{item.tai} 台</span>
            </div>
          ))}
          <div className="hu-row subtotal">
            <span>台數合計</span><span>{tai.total} 台 × {taiPt} = {taiPoints}</span>
          </div>
          {zimoRake > 0 && (
            <div className="hu-row">
              <span>(抽東)</span><span>-{zimoRake}</span>
            </div>
          )}
          <div className="hu-row total">
            <span>共</span><span>{points} 分</span>
          </div>
        </div>

        <button className="hu-close" onClick={onClose}>關閉 ({secondsLeft})</button>
      </div>
    </div>
  )
}
