import { useEffect, useState } from 'react'
import Tile from './Tile'
import type { ActionOptions } from '../game/types'
import type { TileId } from '../game/tiles'

interface Props {
  options: ActionOptions
  onAction: (action: 'pass' | 'hu' | 'peng' | 'gang' | 'chi', chiIndex?: number) => void
}

type PreviewMode =
  | { kind: 'chi'; index: number }
  | { kind: 'peng' }
  | { kind: 'gang' }
  | null

// 把三張牌重排成：[其他1, 吃的那張, 其他2]
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
  const [preview, setPreview] = useState<PreviewMode>(null)

  useEffect(() => {
    setPreview(null)
  }, [options])

  const fromTile = options.fromTile

  // ===== 碰牌預覽（3 張同色牌，棄牌在中間）=====
  if (preview?.kind === 'peng' && fromTile) {
    return (
      <div className="action-bar chi-preview-bar">
        <div className="chi-preview">
          <div className="chi-preview-label">確認碰？</div>
          <div className="chi-preview-tiles">
            {[fromTile, fromTile, fromTile].map((t, i) => (
              <div key={i} className={`chi-preview-tile ${i === 1 ? 'from-discard' : ''}`}>
                <Tile id={t} disabled />
                {i === 1 && <div className="chi-preview-tag">碰</div>}
              </div>
            ))}
          </div>
          <div className="chi-preview-buttons">
            <button className="act-btn peng" onClick={() => { onAction('peng'); setPreview(null) }}>
              ✓ 確認
            </button>
            <button className="act-btn pass" onClick={() => setPreview(null)}>
              ✕ 取消
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ===== 槓牌預覽（4 張同色牌，棄牌在中間偏右位置）=====
  if (preview?.kind === 'gang' && fromTile) {
    // 4 張牌，把 from-discard 放在位置 1（第二張，靠中間）
    const positions = [fromTile, fromTile, fromTile, fromTile]
    const discardPos = 1
    return (
      <div className="action-bar chi-preview-bar">
        <div className="chi-preview">
          <div className="chi-preview-label">確認槓？</div>
          <div className="chi-preview-tiles">
            {positions.map((t, i) => (
              <div key={i} className={`chi-preview-tile ${i === discardPos ? 'from-discard' : ''}`}>
                <Tile id={t} disabled />
                {i === discardPos && <div className="chi-preview-tag">槓</div>}
              </div>
            ))}
          </div>
          <div className="chi-preview-buttons">
            <button className="act-btn gang" onClick={() => { onAction('gang'); setPreview(null) }}>
              ✓ 確認
            </button>
            <button className="act-btn pass" onClick={() => setPreview(null)}>
              ✕ 取消
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ===== 吃牌預覽 =====
  if (preview?.kind === 'chi' && fromTile) {
    const combo = options.canChi[preview.index]
    const arranged = arrangeChiCentered(combo, fromTile)
    return (
      <div className="action-bar chi-preview-bar">
        <div className="chi-preview">
          <div className="chi-preview-label">確認吃牌？</div>
          <div className="chi-preview-tiles">
            {arranged.map((t, i) => (
              <div key={i} className={`chi-preview-tile ${t === fromTile && i === 1 ? 'from-discard' : ''}`}>
                <Tile id={t} disabled />
                {t === fromTile && i === 1 && <div className="chi-preview-tag">吃</div>}
              </div>
            ))}
          </div>
          <div className="chi-preview-buttons">
            <button className="act-btn chi" onClick={() => { onAction('chi', preview.index); setPreview(null) }}>
              ✓ 確認
            </button>
            <button className="act-btn pass" onClick={() => setPreview(null)}>
              ✕ 取消
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ===== 一般動作按鈕（碰/槓/吃都改為內嵌迷你預覽）=====
  return (
    <div className="action-bar">
      {options.canHu && (
        <button className="act-btn hu" onClick={() => onAction('hu')}>胡</button>
      )}
      {options.canGangExposed && fromTile && (
        <button
          className="act-btn chi-inline"
          style={{ background: 'linear-gradient(135deg, #845ef7, #5f3dc4)' }}
          onClick={() => setPreview({ kind: 'gang' })}
        >
          <span className="chi-inline-label">槓</span>
          <span className="chi-inline-tiles">
            {[fromTile, fromTile, fromTile, fromTile].map((t, i) => (
              <span key={i} className={`chi-inline-tile ${i === 1 ? 'from-discard' : ''}`}>
                <Tile id={t} disabled />
              </span>
            ))}
          </span>
        </button>
      )}
      {options.canPeng && fromTile && (
        <button
          className="act-btn chi-inline"
          style={{ background: 'linear-gradient(135deg, #4dabf7, #1864ab)' }}
          onClick={() => setPreview({ kind: 'peng' })}
        >
          <span className="chi-inline-label">碰</span>
          <span className="chi-inline-tiles">
            {[fromTile, fromTile, fromTile].map((t, i) => (
              <span key={i} className={`chi-inline-tile ${i === 1 ? 'from-discard' : ''}`}>
                <Tile id={t} disabled />
              </span>
            ))}
          </span>
        </button>
      )}
      {fromTile && options.canChi.map((combo, idx) => {
        const arranged = arrangeChiCentered(combo, fromTile)
        return (
          <button
            key={idx}
            className="act-btn chi-inline"
            onClick={() => setPreview({ kind: 'chi', index: idx })}
          >
            <span className="chi-inline-label">吃</span>
            <span className="chi-inline-tiles">
              {arranged.map((t, i) => (
                <span key={i} className={`chi-inline-tile ${t === fromTile && i === 1 ? 'from-discard' : ''}`}>
                  <Tile id={t} disabled />
                </span>
              ))}
            </span>
          </button>
        )
      })}
      <button className="act-btn pass" onClick={() => onAction('pass')}>過</button>
    </div>
  )
}
