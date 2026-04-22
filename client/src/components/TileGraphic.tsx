// 麻將牌面：原創 SVG 繪製，依傳統麻將慣例設計
import type { TileId } from '../game/tiles'

interface Props { id: TileId }

export default function TileGraphic({ id }: Props) {
  const suit = id[0]
  const rank = parseInt(id.slice(1), 10)
  return (
    <svg viewBox="0 0 60 80" width="100%" height="100%"
         preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
      {suit === 'm' && <WanGraphic rank={rank} />}
      {suit === 'p' && <PinGraphic rank={rank} />}
      {suit === 's' && <SouGraphic rank={rank} />}
      {suit === 'z' && <ZiGraphic rank={rank} />}
      {suit === 'f' && <FlowerGraphic rank={rank} />}
    </svg>
  )
}

// ===== 萬子：上方黑字數字、下方紅色「萬」 =====
const WAN_DIGITS = ['一', '二', '三', '四', '伍', '六', '七', '八', '九']
function WanGraphic({ rank }: { rank: number }) {
  return (
    <g>
      <text x="30" y="36" textAnchor="middle" fontSize="28" fontWeight="900" fill="#1a1a1a"
            fontFamily="'Noto Serif TC', 'PMingLiU', 'SimSun', serif">
        {WAN_DIGITS[rank - 1]}
      </text>
      <text x="30" y="70" textAnchor="middle" fontSize="28" fontWeight="900" fill="#c0172b"
            fontFamily="'Noto Serif TC', 'PMingLiU', 'SimSun', serif">
        萬
      </text>
    </g>
  )
}

// ===== 筒子：每顆圓點＝外環＋中圈＋紅芯 =====
const PIN_POS: Record<number, Array<[number, number]>> = {
  2: [[30, 22], [30, 58]],
  3: [[18, 20], [30, 40], [42, 60]],
  4: [[20, 24], [40, 24], [20, 56], [40, 56]],
  5: [[20, 20], [40, 20], [30, 40], [20, 60], [40, 60]],
  6: [[20, 22], [40, 22], [20, 40], [40, 40], [20, 58], [40, 58]],
  7: [[30, 14], [20, 30], [30, 30], [40, 30], [20, 56], [30, 56], [40, 56]],
  8: [[20, 16], [40, 16], [20, 32], [40, 32], [20, 48], [40, 48], [20, 64], [40, 64]],
  9: [[18, 20], [30, 20], [42, 20], [18, 40], [30, 40], [42, 40], [18, 60], [30, 60], [42, 60]],
}

function Dot({ x, y, r, color = 'green' }: { x: number; y: number; r: number; color?: 'green' | 'red' }) {
  const outer = color === 'red' ? '#6d0d0d' : '#1b5e20'
  const innerRing = color === 'red' ? '#c0172b' : '#2e7d32'
  const core = color === 'red' ? '#1b5e20' : '#c0172b'
  const coreHL = color === 'red' ? '#66bb6a' : '#ff8a80'
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={outer} />
      <circle cx={x} cy={y} r={r * 0.7} fill="#fdfaec" />
      <circle cx={x} cy={y} r={r * 0.55} fill="none" stroke={innerRing} strokeWidth={r * 0.12} />
      <circle cx={x} cy={y} r={r * 0.28} fill={core} />
      <circle cx={x - r * 0.08} cy={y - r * 0.08} r={r * 0.09} fill={coreHL} opacity="0.7" />
    </g>
  )
}

function PinGraphic({ rank }: { rank: number }) {
  if (rank === 1) {
    // 1 筒：華麗大圓（多層同心環 + 8 瓣花）
    const cx = 30, cy = 40
    return (
      <g>
        <circle cx={cx} cy={cy} r="22" fill="#fdfaec" stroke="#1a1a1a" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r="18" fill="none" stroke="#1a1a1a" strokeWidth="0.7" />
        <circle cx={cx} cy={cy} r="15" fill="#1b5e20" />
        <circle cx={cx} cy={cy} r="12" fill="#fdfaec" />
        <circle cx={cx} cy={cy} r="9" fill="none" stroke="#2e7d32" strokeWidth="1.2" />
        {/* 8 瓣花 */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <ellipse key={deg} cx={cx} cy={cy - 11} rx="1.8" ry="3.2" fill="#c0172b"
                   transform={`rotate(${deg} ${cx} ${cy})`} />
        ))}
        {/* 中心紅 */}
        <circle cx={cx} cy={cy} r="3.5" fill="#c0172b" stroke="#1a1a1a" strokeWidth="0.5" />
      </g>
    )
  }
  // 七筒：上 3 顆綠（斜線）、下 4 顆紅（2×2）
  if (rank === 7) {
    const top: Array<[number, number]> = [[15, 14], [30, 22], [45, 30]]
    const bot: Array<[number, number]> = [[20, 50], [40, 50], [20, 64], [40, 64]]
    return (
      <g>
        {top.map(([x, y], i) => <Dot key={`t${i}`} x={x} y={y} r={7} color="green" />)}
        {bot.map(([x, y], i) => <Dot key={`b${i}`} x={x} y={y} r={7} color="red" />)}
      </g>
    )
  }
  const positions = PIN_POS[rank]
  const r = rank <= 3 ? 7 : rank <= 6 ? 6 : 5
  return (
    <g>
      {positions.map(([x, y], i) => <Dot key={i} x={x} y={y} r={r} />)}
    </g>
  )
}

// ===== 條子：分節竹棍 =====
const SOU_POS: Record<number, Array<[number, number]>> = {
  2: [[22, 40], [38, 40]],
  3: [[30, 22], [22, 56], [38, 56]],
  4: [[22, 24], [38, 24], [22, 56], [38, 56]],
  /* 五條：第 1 行與第 3 行左右寬加大 */
  5: [[16, 20], [44, 20], [30, 40], [16, 60], [44, 60]],
  /* 六條：2 列 × 3 行（上下排） */
  6: [[15, 26], [30, 26], [45, 26], [15, 54], [30, 54], [45, 54]],
  /* 七條：1 紅在頂 + 中間 3 根 + 下方 3 根 */
  7: [[30, 15], [15, 44], [30, 44], [45, 44], [15, 66], [30, 66], [45, 66]],
  /* 八條：2 列 × 4 根 */
  8: [[13, 22], [25, 22], [37, 22], [49, 22], [13, 58], [25, 58], [37, 58], [49, 58]],
  9: [[18, 20], [30, 20], [42, 20], [18, 40], [30, 40], [42, 40], [18, 60], [30, 60], [42, 60]],
}

function Bamboo({ x, y, len, width, red }: { x: number; y: number; len: number; width: number; red?: boolean }) {
  const main = red ? '#c0172b' : '#2e7d32'
  const dark = red ? '#6d0d0d' : '#1b5e20'
  const light = red ? '#f28d94' : '#a5d6a7'
  return (
    <g>
      {/* 陰影 */}
      <rect x={x - width / 2 + 0.4} y={y - len / 2 + 0.4}
            width={width} height={len} rx="1.5" fill={dark} opacity="0.35" />
      {/* 主體 */}
      <rect x={x - width / 2} y={y - len / 2}
            width={width} height={len} rx="1.5" fill={main} stroke={dark} strokeWidth="0.7" />
      {/* 頂蓋 */}
      <rect x={x - width / 2 - 0.4} y={y - len / 2 - 0.6}
            width={width + 0.8} height={1.6} rx="0.5" fill={dark} />
      {/* 底蓋 */}
      <rect x={x - width / 2 - 0.4} y={y + len / 2 - 1}
            width={width + 0.8} height={1.6} rx="0.5" fill={dark} />
      {/* 中節 */}
      {len > 14 && (
        <rect x={x - width / 2 - 0.2} y={y - 0.7}
              width={width + 0.4} height={1.4} fill={dark} />
      )}
      {/* 高光條 */}
      <rect x={x - width / 2 + 0.7} y={y - len / 2 + 1.5}
            width={width * 0.28} height={len - 3.5} rx="0.5"
            fill={light} opacity="0.65" />
    </g>
  )
}

function SouGraphic({ rank }: { rank: number }) {
  if (rank === 1) {
    // 保留原本的卡通雀鳥
    return (
      <g>
        <path d="M 14 48 Q 6 52 10 58 Q 18 54 22 50 Z" fill="#2e7d32" />
        <path d="M 10 58 Q 14 62 18 58" fill="none" stroke="#1b5e20" strokeWidth="1" />
        <ellipse cx="32" cy="46" rx="15" ry="11" fill="#1976d2" />
        <path d="M 32 36 Q 22 30 20 42 Q 26 42 32 40 Z" fill="#0d47a1" />
        <ellipse cx="28" cy="42" rx="4" ry="2" fill="#64b5f6" opacity="0.6" />
        <circle cx="42" cy="33" r="7" fill="#d32f2f" />
        <circle cx="40" cy="31" r="2" fill="#ff8a80" opacity="0.7" />
        <path d="M 44 26 Q 46 22 48 25 M 46 27 Q 48 23 50 26" fill="none" stroke="#d32f2f" strokeWidth="1.5" />
        <polygon points="48,33 54,34 48,37" fill="#f57c00" stroke="#b23c00" strokeWidth="0.5" />
        <circle cx="43" cy="31" r="1.5" fill="#111" />
        <circle cx="43.5" cy="30.5" r="0.5" fill="white" />
        <line x1="28" y1="56" x2="28" y2="66" stroke="#f57c00" strokeWidth="1.5" />
        <line x1="35" y1="56" x2="35" y2="66" stroke="#f57c00" strokeWidth="1.5" />
        <line x1="26" y1="66" x2="30" y2="66" stroke="#f57c00" strokeWidth="1.5" />
        <line x1="33" y1="66" x2="37" y2="66" stroke="#f57c00" strokeWidth="1.5" />
      </g>
    )
  }
  const positions = SOU_POS[rank]
  const stickLen = rank <= 3 ? 22 : rank === 7 ? 18 : rank === 8 ? 15 : rank <= 6 ? 16 : 11
  const stickWidth = rank <= 3 ? 5.5 : (rank === 5 || rank === 7) ? 5 : rank === 8 ? 3.5 : 4
  // 4、7 條傳統為紅色
  const isRed = rank === 4 || rank === 7
  return (
    <g>
      {positions.map(([x, y], i) => {
        // 7 條其中 1 根紅、其他綠
        let useRed = isRed
        if (rank === 7) useRed = i === 0  // 最上方那根紅
        return (
          <Bamboo key={i} x={x} y={y} len={stickLen} width={stickWidth} red={useRed} />
        )
      })}
    </g>
  )
}

// ===== 字牌 =====
const ZI_INFO: Array<{ char: string; color: string }> = [
  { char: '東', color: '#111' },
  { char: '南', color: '#111' },
  { char: '西', color: '#111' },
  { char: '北', color: '#111' },
  { char: '中', color: '#c0172b' },
  { char: '發', color: '#2e7d32' },
  { char: '白', color: '#1565c0' },
]
function ZiGraphic({ rank }: { rank: number }) {
  const info = ZI_INFO[rank - 1]
  if (rank === 7) {
    return (
      <g>
        <rect x="12" y="16" width="36" height="48" rx="4" ry="4"
              fill="none" stroke={info.color} strokeWidth="3" />
        <rect x="15" y="19" width="30" height="42" rx="2" ry="2"
              fill="none" stroke={info.color} strokeWidth="1" opacity="0.45" />
      </g>
    )
  }
  return (
    <text x="30" y="56" textAnchor="middle" fontSize="44" fontWeight="900" fill={info.color}
          fontFamily="'Noto Serif TC', 'PMingLiU', 'SimSun', serif">
      {info.char}
    </text>
  )
}

// ===== 花牌 =====
const FLOWER_INFO: Array<{ char: string; color: string; label: string; decoColor: string }> = [
  { char: '春', color: '#2e7d32', label: '一', decoColor: '#c8e6c9' },
  { char: '夏', color: '#c0172b', label: '二', decoColor: '#ffcdd2' },
  { char: '秋', color: '#e65100', label: '三', decoColor: '#ffe0b2' },
  { char: '冬', color: '#0d47a1', label: '四', decoColor: '#bbdefb' },
  { char: '梅', color: '#c2185b', label: '', decoColor: '#f8bbd0' },
  { char: '蘭', color: '#2e7d32', label: '', decoColor: '#c8e6c9' },
  { char: '竹', color: '#1b5e20', label: '', decoColor: '#a5d6a7' },
  { char: '菊', color: '#f9a825', label: '', decoColor: '#fff9c4' },
]
function FlowerGraphic({ rank }: { rank: number }) {
  const info = FLOWER_INFO[rank - 1]
  return (
    <g>
      <circle cx="30" cy="45" r="18" fill={info.decoColor} opacity="0.55" />
      {info.label && (
        <text x="48" y="20" textAnchor="middle" fontSize="14" fontWeight="800" fill={info.color}
              fontFamily="'Noto Serif TC', 'PMingLiU', serif">
          {info.label}
        </text>
      )}
      <text x="30" y="56" textAnchor="middle" fontSize="34" fontWeight="900" fill={info.color}
            fontFamily="'Noto Serif TC', 'PMingLiU', serif">
        {info.char}
      </text>
    </g>
  )
}
