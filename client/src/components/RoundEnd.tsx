import type { SeatIndex } from '../game/types'
import { SEAT_LABELS } from '../game/types'

interface Props {
  scores: Array<{ seat: SeatIndex; name: string; score: number }>
  onClose: () => void
}

export default function RoundEnd({ scores, onClose }: Props) {
  // 依分數排序
  const ranked = [...scores].sort((a, b) => b.score - a.score)
  const medals = ['🥇', '🥈', '🥉', '4️⃣']
  return (
    <div className="hu-overlay" onClick={onClose}>
      <div className="hu-panel" onClick={(e) => e.stopPropagation()}>
        <div className="hu-title">🏆 本圈結束（4 局完成）</div>
        <div className="hu-subtitle">最終排名</div>

        <div className="round-rank">
          {ranked.map((r, i) => (
            <div key={r.seat} className={`rank-row rank-${i}`}>
              <span className="rank-medal">{medals[i]}</span>
              <span className="rank-name">{SEAT_LABELS[r.seat]}家 · {r.name}</span>
              <span className={`rank-score ${r.score >= 0 ? 'pos' : 'neg'}`}>
                {r.score >= 0 ? '+' : ''}{r.score}
              </span>
            </div>
          ))}
        </div>

        <button className="hu-close" onClick={onClose}>關閉</button>
      </div>
    </div>
  )
}
