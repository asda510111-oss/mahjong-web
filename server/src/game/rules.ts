// 台灣 16 張麻將規則核心演算法
// 純函式、無狀態，前後端共用
//
// 名詞：
//   面子 (meld)：刻子(AAA) / 順子(ABC) / 槓(AAAA 當作 1 組)
//   將 (pair)：對子(AA)
//   胡牌：5 組面子 + 1 對將（含已露出的副子）
//   副子：已公開的面子（碰、槓、吃）

import type { TileId } from './tiles.js'
import { getTileDef } from './tiles.js'

export type MeldType = 'peng' | 'gang_exposed' | 'gang_concealed' | 'gang_added' | 'chi' | 'flower'

export interface Meld {
  type: MeldType
  tiles: TileId[]
  fromSeat?: number // 來自哪家（碰/明槓/吃）
}

export function countTiles(tiles: TileId[]): Map<TileId, number> {
  const m = new Map<TileId, number>()
  for (const t of tiles) m.set(t, (m.get(t) ?? 0) + 1)
  return m
}

// ================ 胡牌判斷 ================
// hand: 包含剛摸到/剛放炮的那張
// meldCount: 已露出副子數（槓也是 1 組；花牌不算）
export function canHu(hand: TileId[], meldCount: number): boolean {
  const clean = hand.filter((t) => !getTileDef(t).isFlower)
  const need = 5 - meldCount
  if (need < 0) return false
  const expected = need * 3 + 2
  if (clean.length !== expected) return false

  const counts = countTiles(clean)
  const uniques = [...counts.keys()]
  for (const pairTile of uniques) {
    if ((counts.get(pairTile) ?? 0) >= 2) {
      counts.set(pairTile, counts.get(pairTile)! - 2)
      if (canFormMelds(counts, need)) {
        counts.set(pairTile, counts.get(pairTile)! + 2)
        return true
      }
      counts.set(pairTile, counts.get(pairTile)! + 2)
    }
  }
  return false
}

function canFormMelds(counts: Map<TileId, number>, need: number): boolean {
  if (need === 0) {
    for (const v of counts.values()) if (v !== 0) return false
    return true
  }
  // 找最小的非零牌
  let firstTile: TileId | null = null
  for (const k of [...counts.keys()].sort()) {
    if ((counts.get(k) ?? 0) > 0) { firstTile = k; break }
  }
  if (!firstTile) return false

  const suit = firstTile[0]
  const rank = parseInt(firstTile.slice(1), 10)

  // 刻子
  if ((counts.get(firstTile) ?? 0) >= 3) {
    counts.set(firstTile, counts.get(firstTile)! - 3)
    if (canFormMelds(counts, need - 1)) {
      counts.set(firstTile, counts.get(firstTile)! + 3)
      return true
    }
    counts.set(firstTile, counts.get(firstTile)! + 3)
  }

  // 順子（只限 m/p/s，且 rank <= 7）
  if ((suit === 'm' || suit === 'p' || suit === 's') && rank <= 7) {
    const t2 = `${suit}${rank + 1}` as TileId
    const t3 = `${suit}${rank + 2}` as TileId
    if ((counts.get(t2) ?? 0) > 0 && (counts.get(t3) ?? 0) > 0) {
      counts.set(firstTile, counts.get(firstTile)! - 1)
      counts.set(t2, counts.get(t2)! - 1)
      counts.set(t3, counts.get(t3)! - 1)
      if (canFormMelds(counts, need - 1)) {
        counts.set(firstTile, counts.get(firstTile)! + 1)
        counts.set(t2, counts.get(t2)! + 1)
        counts.set(t3, counts.get(t3)! + 1)
        return true
      }
      counts.set(firstTile, counts.get(firstTile)! + 1)
      counts.set(t2, counts.get(t2)! + 1)
      counts.set(t3, counts.get(t3)! + 1)
    }
  }

  return false
}

// ================ 碰 / 槓 / 吃 ================
export function canPeng(hand: TileId[], tile: TileId): boolean {
  return hand.filter((t) => t === tile).length >= 2
}

export function canGangExposed(hand: TileId[], tile: TileId): boolean {
  return hand.filter((t) => t === tile).length >= 3
}

export function canGangConcealed(hand: TileId[]): TileId[] {
  const res: TileId[] = []
  for (const [t, c] of countTiles(hand)) if (c >= 4) res.push(t)
  return res
}

export function canGangAdded(hand: TileId[], melds: Meld[]): TileId[] {
  const res: TileId[] = []
  for (const m of melds) {
    if (m.type === 'peng' && hand.includes(m.tiles[0])) res.push(m.tiles[0])
  }
  return res
}

// 吃：只能吃上家丟的萬筒條；回傳所有可能的三張面子組合
export function canChi(hand: TileId[], tile: TileId): Array<[TileId, TileId, TileId]> {
  const suit = tile[0]
  if (suit !== 'm' && suit !== 'p' && suit !== 's') return []
  const rank = parseInt(tile.slice(1), 10)
  const cts = countTiles(hand)
  const options: Array<[TileId, TileId, TileId]> = []

  const tryChi = (r1: number, r2: number, r3: number) => {
    if (r1 < 1 || r3 > 9) return
    const ids = [r1, r2, r3].map((r) => `${suit}${r}` as TileId) as [TileId, TileId, TileId]
    const needed = new Map<TileId, number>()
    for (const t of ids) if (t !== tile) needed.set(t, (needed.get(t) ?? 0) + 1)
    for (const [t, c] of needed) if ((cts.get(t) ?? 0) < c) return
    options.push(ids)
  }
  tryChi(rank - 2, rank - 1, rank)
  tryChi(rank - 1, rank, rank + 1)
  tryChi(rank, rank + 1, rank + 2)
  return options
}

// ================ 聽牌 ================
const ALL_NUMBER_TILES: TileId[] = (() => {
  const res: TileId[] = []
  for (const s of ['m', 'p', 's'] as const) for (let r = 1; r <= 9; r++) res.push(`${s}${r}`)
  for (let r = 1; r <= 7; r++) res.push(`z${r}`)
  return res
})()

export function getTingTiles(hand: TileId[], meldCount: number): TileId[] {
  const res: TileId[] = []
  for (const t of ALL_NUMBER_TILES) {
    if (canHu([...hand, t], meldCount)) res.push(t)
  }
  return res
}

// ================ 台數計算 ================
export interface TaiContext {
  hand: TileId[]           // 含胡牌
  melds: Meld[]             // 所有副子（含花）
  isZimo: boolean           // 自摸
  winTile: TileId
  seatWind: number          // 0=東 1=南 2=西 3=北
  roundWind?: number        // 圈風 0=東 1=南 2=西 3=北（預設東圈）
  isDealer: boolean
  consecutiveDealer: number // 連莊次數
  isTianHu?: boolean        // 天胡：莊家發牌就胡
  isDiHu?: boolean          // 地胡：閒家第一巡自摸
  isRenHu?: boolean         // 人胡：閒家第一巡胡到莊家打的牌
  isGangShangZimo?: boolean // 槓上自摸
  isQiangGang?: boolean     // 搶槓胡
  isHaiDi?: boolean         // 海底撈月（最後一張牌自摸）
}

export interface TaiItem { name: string; tai: number }
export interface TaiResult { total: number; items: TaiItem[] }

export function calculateTai(ctx: TaiContext): TaiResult {
  const items: TaiItem[] = []
  const { hand, melds, isZimo, winTile, seatWind, roundWind = 0, isDealer, consecutiveDealer,
    isTianHu = false, isDiHu = false, isRenHu = false,
    isGangShangZimo = false, isQiangGang = false, isHaiDi = false } = ctx
  const nonFlowerMelds = melds.filter(m => m.type !== 'flower')
  const flowerMelds = melds.filter(m => m.type === 'flower')

  // 門清：沒有碰、明槓、吃（只允許暗槓和花牌）
  const concealed = nonFlowerMelds.every(m => m.type === 'gang_concealed')

  if (isZimo) items.push({ name: '自摸', tai: 1 })
  if (concealed) items.push({ name: '門清', tai: 1 })
  if (concealed && isZimo) items.push({ name: '門清自摸', tai: 1 })

  // 花牌：每張不額外算台（僅正花計算）
  // 正花：季節花 f(seatWind+1)、梅蘭竹菊 f(seatWind+5)
  const seasonFlower = `f${seatWind + 1}`
  const plantFlower = `f${seatWind + 5}`
  let zhengHua = 0
  for (const m of flowerMelds) {
    if (m.tiles[0] === seasonFlower || m.tiles[0] === plantFlower) zhengHua++
  }
  if (zhengHua > 0) items.push({ name: `正花 ×${zhengHua}`, tai: zhengHua })

  // 花槓：4 張季節花（f1-f4）或 4 張植物花（f5-f8）各 +2
  const seasonCount = flowerMelds.filter(m => {
    const t = m.tiles[0]
    return t === 'f1' || t === 'f2' || t === 'f3' || t === 'f4'
  }).length
  const plantCount = flowerMelds.filter(m => {
    const t = m.tiles[0]
    return t === 'f5' || t === 'f6' || t === 'f7' || t === 'f8'
  }).length
  if (seasonCount >= 4) items.push({ name: '花槓(季節)', tai: 2 })
  if (plantCount >= 4) items.push({ name: '花槓(植物)', tai: 2 })

  // 全部手+副子的牌（不含花）
  const allTiles: TileId[] = [...hand]
  for (const m of nonFlowerMelds) allTiles.push(...m.tiles)
  const suits = new Set(allTiles.map(t => t[0]))

  // 一色
  if (suits.size === 1) {
    if (suits.has('z')) items.push({ name: '字一色', tai: 8 })
    else items.push({ name: '清一色', tai: 8 })
  } else if (suits.size === 2 && suits.has('z')) {
    items.push({ name: '混一色', tai: 4 })
  }

  // 三元：中 z5、發 z6、白 z7
  const dragons = ['z5', 'z6', 'z7']
  let dragonMelds = 0, dragonPair = 0
  for (const d of dragons) {
    const c = allTiles.filter(t => t === d).length
    if (c >= 3) dragonMelds++
    else if (c === 2) dragonPair++
  }
  if (dragonMelds === 3) items.push({ name: '大三元', tai: 8 })
  else if (dragonMelds === 2 && dragonPair === 1) items.push({ name: '小三元', tai: 4 })

  // 四喜：東南西北 z1-z4
  const windTiles = ['z1', 'z2', 'z3', 'z4']
  let windMelds = 0, windPair = 0
  for (const w of windTiles) {
    const c = allTiles.filter(t => t === w).length
    if (c >= 3) windMelds++
    else if (c === 2) windPair++
  }
  if (windMelds === 4) items.push({ name: '大四喜', tai: 16 })
  else if (windMelds === 3 && windPair === 1) items.push({ name: '小四喜', tai: 8 })

  // 門風牌 / 圈風牌 / 三元牌：刻子 +1
  // seatWind 0=東(z1)..3=北(z4)
  const myWindTile = `z${seatWind + 1}`
  const roundWindTile = `z${roundWind + 1}`
  if (allTiles.filter(t => t === myWindTile).length >= 3) {
    items.push({ name: '門風牌', tai: 1 })
  }
  // 圈風牌（與門風可雙算 → 連風刻）
  if (allTiles.filter(t => t === roundWindTile).length >= 3) {
    items.push({ name: '圈風牌', tai: 1 })
  }
  for (const d of dragons) {
    if (allTiles.filter(t => t === d).length >= 3) {
      const labels: Record<string, string> = { z5: '中', z6: '發', z7: '白' }
      items.push({ name: `${labels[d]}刻`, tai: 1 })
    }
  }

  // 碰碰胡：無吃副子 + 手牌只有對/刻子/槓
  const hasChi = nonFlowerMelds.some(m => m.type === 'chi')
  if (!hasChi) {
    // 手上每種牌的數量只能是 0、2、3、4
    const cts = countTiles(hand)
    let pairCount = 0
    let ok = true
    for (const [, c] of cts) {
      if (c === 2) pairCount++
      else if (c !== 3 && c !== 4) { ok = false; break }
    }
    if (ok && pairCount === 1) items.push({ name: '碰碰胡', tai: 4 })
  }

  // 全求人：所有非花副子皆為吃/碰/明槓（非暗槓），放槍胡，且手牌剩 winTile + 1 張對子
  const allExposed = nonFlowerMelds.length > 0 && nonFlowerMelds.every(
    m => m.type === 'chi' || m.type === 'peng' || m.type === 'gang_exposed'
  )
  const handWithoutWin = [...hand]
  const wIdx = handWithoutWin.indexOf(winTile)
  if (wIdx >= 0) handWithoutWin.splice(wIdx, 1)
  const isSingleWait = handWithoutWin.length === 1 && handWithoutWin[0] === winTile
  if (allExposed && !isZimo && isSingleWait) {
    items.push({ name: '全求人', tai: 1 })
  }

  // 獨聽：去掉 winTile 後計算聽牌數，若只有 1 張 = 獨聽
  const tingAfterRemove = getTingTiles(handWithoutWin, nonFlowerMelds.length)
  if (tingAfterRemove.length === 1) {
    items.push({ name: '獨聽', tai: 1 })
  }

  // 天地人胡（互斥）
  if (isTianHu) items.push({ name: '天胡', tai: 8 })
  else if (isDiHu) items.push({ name: '地胡', tai: 8 })
  else if (isRenHu) items.push({ name: '人胡', tai: 8 })

  // 槓上自摸 / 搶槓胡 / 海底撈月
  if (isGangShangZimo) items.push({ name: '槓上自摸', tai: 1 })
  if (isQiangGang) items.push({ name: '搶槓胡', tai: 1 })
  if (isHaiDi) items.push({ name: '海底撈月', tai: 1 })

  // 平胡：所有非花副子皆為順子 + 雀頭非字牌 + 非自摸
  const allChi = nonFlowerMelds.length > 0 && nonFlowerMelds.every(m => m.type === 'chi')
  if (allChi && !isZimo) {
    // 找雀頭（手牌去掉 winTile 後應該形成 順子 + 對子；偵測對子是否 z 開頭）
    const handCounts = countTiles(hand)
    let pairTile: TileId | null = null
    for (const [t, c] of handCounts) {
      if (c === 2) { pairTile = t; break }
    }
    // 雀頭非字
    if (pairTile && !String(pairTile).startsWith('z')) {
      items.push({ name: '平胡', tai: 1 })
    }
  }

  // 暗刻計算：hand 中 3+ 張同牌 + gang_concealed
  // 放槍時，若 winTile 剛好組成三張，該組算明刻；自摸則所有皆算暗刻
  const handCountsForAn = countTiles(hand)
  let anKeCount = nonFlowerMelds.filter(m => m.type === 'gang_concealed').length
  for (const [t, c] of handCountsForAn) {
    if (c >= 3) {
      if (!isZimo && t === winTile && c === 3) continue // 放槍單吊進刻 → 明刻
      anKeCount++
    }
  }
  if (anKeCount === 5) items.push({ name: '五暗刻', tai: 8 })
  else if (anKeCount === 4) items.push({ name: '四暗刻', tai: 5 })
  else if (anKeCount === 3) items.push({ name: '三暗刻', tai: 2 })

  // 做莊 +1 台
  if (isDealer) {
    items.push({ name: '莊家', tai: 1 })
  }
  // 連莊：連 N = 2N + 1 台（連1=3、連2=5、連3=7…）
  if (isDealer && consecutiveDealer > 0) {
    const lianTai = 2 * consecutiveDealer + 1
    items.push({ name: `連${consecutiveDealer}`, tai: lianTai })
  }

  return { total: items.reduce((s, i) => s + i.tai, 0), items }
}

