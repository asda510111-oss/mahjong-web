interface Plan {
  id: string
  name: string
  cards: number
  bonus: number
  priceTwd: number
}

// 每張基本價 $4，階梯式贈送讓大包單價更便宜
const PLANS: Plan[] = [
  { id: 'small',  name: '小包',   cards: 50,   bonus: 0,   priceTwd: 200 },  // $4.00/張
  { id: 'medium', name: '中包',   cards: 100,  bonus: 10,  priceTwd: 400 },  // $3.64/張
  { id: 'large',  name: '大包',   cards: 300,  bonus: 60,  priceTwd: 1200 }, // $3.33/張
  { id: 'xl',     name: '超大包', cards: 1500, bonus: 500, priceTwd: 6000 }, // $3.00/張
]

interface Props {
  open: boolean
  currentCards: number
  onClose: () => void
}

export default function BuyCardsDialog({ open, currentCards, onClose }: Props) {
  if (!open) return null
  return (
    <div className="buy-cards-overlay" onClick={onClose}>
      <div className="buy-cards-panel" onClick={(e) => e.stopPropagation()}>
        <div className="buy-cards-header">
          <h3>🎴 購買房卡</h3>
          <button className="buy-cards-close" onClick={onClose}>✕</button>
        </div>

        <div className="buy-cards-current">
          目前持有：<strong>{currentCards}</strong> 張
        </div>

        <div className="buy-cards-plans">
          {PLANS.map(p => (
            <button
              key={p.id}
              className="buy-cards-plan"
              onClick={() => alert(`${p.name}：金流串接尚未上線`)}
            >
              <div className="buy-cards-plan-name">{p.name}</div>
              <div className="buy-cards-plan-cards">
                {p.cards} 張
                {p.bonus > 0 && <span className="buy-cards-plan-bonus"> +{p.bonus} 贈送</span>}
              </div>
              <div className="buy-cards-plan-price">NT$ {p.priceTwd}</div>
            </button>
          ))}
        </div>

        <div className="buy-cards-note">
          ※ 金流串接上線前，請聯絡管理員手動加值
        </div>
      </div>
    </div>
  )
}
