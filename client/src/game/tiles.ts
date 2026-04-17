// 台灣麻將牌定義
// 144 張：萬筒條各 36、字牌 28、花牌 8
//
// 編碼規則：
//   萬(m) 1-9、筒(p) 1-9、條(s) 1-9
//   字(z) 1=東 2=南 3=西 4=北 5=中 6=發 7=白
//   花(f) 1=春 2=夏 3=秋 4=冬 5=梅 6=蘭 7=竹 8=菊
//
// Tile id 格式：`${suit}${rank}` 例如 "m5" = 五萬、"z5" = 紅中

export type Suit = 'm' | 'p' | 's' | 'z' | 'f'
export type TileId = string // 'm1'..'m9' | 'p1'..'p9' | 's1'..'s9' | 'z1'..'z7' | 'f1'..'f8'

export interface TileDef {
  id: TileId
  suit: Suit
  rank: number
  label: string     // 中文顯示（萬/筒/條/東/南...）
  unicode: string   // Unicode 麻將字元
  isFlower: boolean
  isHonor: boolean
}

const WAN_UNI = ['🀇', '🀈', '🀉', '🀊', '🀋', '🀌', '🀍', '🀎', '🀏']
const TONG_UNI = ['🀙', '🀚', '🀛', '🀜', '🀝', '🀞', '🀟', '🀠', '🀡']
const TIAO_UNI = ['🀐', '🀑', '🀒', '🀓', '🀔', '🀕', '🀖', '🀗', '🀘']
const ZI_UNI = ['🀀', '🀁', '🀂', '🀃', '🀄', '🀅', '🀆']
const ZI_LABEL = ['東', '南', '西', '北', '中', '發', '白']
const FLOWER_UNI = ['🀢', '🀣', '🀤', '🀥', '🀦', '🀧', '🀨', '🀩']
// ^ Unicode 順序：春夏秋冬 + 梅蘭竹菊（Godot 的字形不一定都有，但瀏覽器 emoji font 通常支援）
const FLOWER_LABEL = ['春', '夏', '秋', '冬', '梅', '蘭', '竹', '菊']

export function getTileDef(id: TileId): TileDef {
  const suit = id[0] as Suit
  const rank = parseInt(id.slice(1), 10)
  switch (suit) {
    case 'm':
      return { id, suit, rank, label: `${rank}萬`, unicode: WAN_UNI[rank - 1], isFlower: false, isHonor: false }
    case 'p':
      return { id, suit, rank, label: `${rank}筒`, unicode: TONG_UNI[rank - 1], isFlower: false, isHonor: false }
    case 's':
      return { id, suit, rank, label: `${rank}條`, unicode: TIAO_UNI[rank - 1], isFlower: false, isHonor: false }
    case 'z':
      return { id, suit, rank, label: ZI_LABEL[rank - 1], unicode: ZI_UNI[rank - 1], isFlower: false, isHonor: true }
    case 'f':
      return { id, suit, rank, label: FLOWER_LABEL[rank - 1], unicode: FLOWER_UNI[rank - 1], isFlower: true, isHonor: false }
  }
}

// 判斷牌在 CSS 中需要的特殊顏色（紅中、發）
export function getTileColorClass(id: TileId): string {
  if (id === 'z5') return 'red'   // 中
  if (id === 'z6') return 'green' // 發
  return ''
}

// 建立完整 144 張牌庫
export function buildFullWall(): TileId[] {
  const wall: TileId[] = []
  for (const suit of ['m', 'p', 's'] as const) {
    for (let rank = 1; rank <= 9; rank++) {
      for (let c = 0; c < 4; c++) wall.push(`${suit}${rank}`)
    }
  }
  for (let rank = 1; rank <= 7; rank++) {
    for (let c = 0; c < 4; c++) wall.push(`z${rank}`)
  }
  for (let rank = 1; rank <= 8; rank++) {
    wall.push(`f${rank}`)
  }
  return wall
}

// 洗牌 (Fisher-Yates)
export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 排序：花 → 萬 → 筒 → 條 → 字，同花色依 rank
const SUIT_ORDER: Record<Suit, number> = { f: 0, m: 1, p: 2, s: 3, z: 4 }
export function sortHand(hand: TileId[]): TileId[] {
  return [...hand].sort((a, b) => {
    const sa = a[0] as Suit
    const sb = b[0] as Suit
    if (sa !== sb) return SUIT_ORDER[sa] - SUIT_ORDER[sb]
    return parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10)
  })
}
