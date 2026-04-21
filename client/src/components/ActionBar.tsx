import type { ActionOptions } from '../game/types'

interface Props {
  options: ActionOptions
  onAction: (action: 'pass' | 'hu' | 'peng' | 'gang' | 'chi', chiIndex?: number) => void
}

// 簡化版：僅五顆按鈕（吃/碰/槓/胡/過），點擊即執行，不顯示預覽
export default function ActionBar({ options, onAction }: Props) {
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
        <button className="act-btn chi" onClick={() => onAction('chi', 0)}>吃</button>
      )}
      <button className="act-btn pass" onClick={() => onAction('pass')}>過</button>
    </div>
  )
}
