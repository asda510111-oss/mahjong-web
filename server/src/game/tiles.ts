// 伺服器端牌組邏輯（與 client 同步）
export type Suit = 'm' | 'p' | 's' | 'z' | 'f'
export type TileId = string

export interface TileDef {
  id: TileId
  suit: Suit
  rank: number
  isFlower: boolean
  isHonor: boolean
}

export function getTileDef(id: TileId): TileDef {
  const suit = id[0] as Suit
  const rank = parseInt(id.slice(1), 10)
  return {
    id,
    suit,
    rank,
    isFlower: suit === 'f',
    isHonor: suit === 'z',
  }
}

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

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
