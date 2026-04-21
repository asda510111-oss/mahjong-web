import { useEffect, useState } from 'react'
import Tile from './Tile'
import type { ActionOptions } from '../game/types'
import type { TileId } from '../game/tiles'

interface Props {
  options: ActionOptions
  onAction: (action: 'pass' | 'hu' | 'peng' | 'gang' | 'chi', chiIndex?: number) => void
}

// 把三張牌重排成：[其他1, 吃的那張, 其他2]，吃的那張在中間
function arrangeChiCentered(
  tiles: [TileId, TileId, TileId],
  discardTile: TileId,
): [TileId, TileId, TileId] {
  const others: TileId[] = []
  let removed = false
  for (const t of tiles) {
    if (!removed && t === discardTile) { removed = true; continue }
    others.push(t)
  }
  others.sort()
  return [others[0] ?? discardTile, discardTile, others[1] ?? discardTile]
}

export default function ActionBar({ options, onAction }: Props) {
  const [chiPickerOpen, setChiPickerOpen] = useState(false)
  const fromTile = options.fromTile

  useEffect(() => {
    setChiPickerOpen(false)
  }, [options])

  // ===== 吃牌組合選擇畫面 =====
  if (chiPickerOpen && fromTile && options.canChi.length > 0) {
    return (
      <div className="action-bar chi-picker-bar">
        <div className="chi-picker-label">選擇吃牌組合</div>
        <div className="chi-picker-options">
          {options.canChi.map((combo, idx) => {
            const arranged = arrangeChiCentered(combo, fromTile)
            return (
              <button
                key={idx}
                className="chi-picker-option"
                onClick={() => { onAction('chi', idx); setChiPickerOpen(false) }}
              >
                {arranged.map((t, i) => (
                  <span
                    key={i}
                    className={`chi-picker-tile ${t === fromTile && i === 1 ? 'from-discard' : ''}`}
                  >
                    <Tile id={t} disabled />
                  </span>
                ))}
              </button>
            )
          })}
          <button className="act-btn pass" onClick={() => setChiPickerOpen(false)}>取消</button>
        </div>
      </div>
    )
  }

  // ===== 主選單：僅五顆按鈕 =====
  return (
    <div className="action-bar">
      {options.canHu && (
        <button className="act-btn hu" onClick={() => onAction('hu')}>胡</button>
      )}
      {options.canGangExposed && (
        <button className="act-btn gang" onClick={() => onAction('gang')}>槓</button>
      )}
      {options.canPeng && (
        <button className="act-btn peng" onClick={() => onAction('peng')}>碰</button>
      )}
      {options.canChi.length > 0 && (
        <button
          className="act-btn chi"
          onClick={() => {
            // 只有一組就直接吃，多組則開組合選單
            if (options.canChi.length === 1) onAction('chi', 0)
            else setChiPickerOpen(true)
          }}
        >
          吃
        </button>
      )}
      <button className="act-btn pass" onClick={() => onAction('pass')}>過</button>
    </div>
  )
}
