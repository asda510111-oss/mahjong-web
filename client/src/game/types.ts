import type { TileId } from './tiles'
import type { Meld, TaiResult } from './rules'

export type SeatIndex = 0 | 1 | 2 | 3
export const SEAT_LABELS = ['東', '南', '西', '北'] as const

export interface PlayerInfo {
  id: string
  name: string
  seat: SeatIndex
  isBot: boolean
  isConnected: boolean
  accountScore?: number
  cards?: number
}

export interface RoomState {
  code: string
  players: PlayerInfo[]
  phase: 'lobby' | 'playing' | 'ended'
  hostId: string
  base: 300 | 200
  taiPt: 100 | 50
  jiang: 1 | 2
}

// 公開的玩家狀態：手牌數、副子、棄牌（不含具體手牌）
export interface PublicPlayerState {
  accountScore?: number  // 該玩家帳號的現有點數
  seat: SeatIndex
  handCount: number
  melds: Meld[]
  discards: TileId[]
}

// 輪到我打牌時，若能做動作會帶這個
export interface ActionOptions {
  canHu: boolean                      // 胡（自摸或接炮）
  canPeng: boolean                    // 碰別人打的牌
  canGangExposed: boolean             // 明槓別人打的牌
  canGangConcealed: TileId[]          // 可暗槓的牌（自己回合才能）
  canGangAdded: TileId[]              // 可加槓（碰過再摸到第 4 張）
  canChi: Array<[TileId, TileId, TileId]> // 可吃的組合（只限下家吃上家打的萬筒條）
  fromTile?: TileId                   // 觸發這些選項的牌（別人打的那張）
  fromSeat?: SeatIndex                // 打牌者座位
}

// ========== 客戶端 → 伺服器 ==========
export type ClientMessage =
  | { type: 'hello'; name: string }
  | { type: 'create_room'; settings?: { base: 300 | 200; taiPt: 100 | 50; jiang: 1 | 2 } }
  | { type: 'join_room'; code: string }
  | { type: 'quick_match' }
  | { type: 'list_rooms'; name: string }
  | { type: 'set_settings'; base: 300 | 200; taiPt: 100 | 50; jiang: 1 | 2 }
  | { type: 'login'; name: string; password: string }
  | { type: 'auth'; token: string }
  | { type: 'leave_room' }
  | { type: 'add_bot' }
  | { type: 'start_game' }
  | { type: 'discard'; tile: TileId }
  | { type: 'action'; action: 'pass' | 'hu' | 'peng' | 'gang' | 'chi'; chiIndex?: number; gangTile?: TileId }
  | { type: 'result_close' }

// ========== 伺服器 → 客戶端 ==========
export type ServerMessage =
  | { type: 'welcome'; playerId: string }
  | { type: 'room_update'; room: RoomState }
  | { type: 'error'; message: string }
  | { type: 'room_list'; rooms: Array<{ code: string; players: number; hostName: string }> }
  | { type: 'auth_result'; ok: boolean; error?: string; token?: string; profile?: { name: string; avatar: 0|1|2|3; score: number; cards: number } }
  | { type: 'game_start'; seed: number; gameIndex: number; dealerSeat: SeatIndex; consecutiveDealer: number }
  | { type: 'round_end'; scores: Array<{ seat: SeatIndex; name: string; score: number }> }
  | { type: 'deal'; hand: TileId[]; dealerSeat: SeatIndex }
  | { type: 'turn'; seat: SeatIndex }
  | { type: 'tile_drawn'; seat: SeatIndex; tile?: TileId }
  | { type: 'tile_discarded'; seat: SeatIndex; tile: TileId }
  | { type: 'hand_update'; hand: TileId[] }                    // 手牌同步（碰/槓/吃後）
  | { type: 'meld_formed'; seat: SeatIndex; meld: Meld }       // 副子公開
  | { type: 'public_state'; states: PublicPlayerState[]; wallRemaining: number }
  | { type: 'action_options'; options: ActionOptions }         // 給你動作選項
  | { type: 'action_taken'; seat: SeatIndex; action: 'hu' | 'peng' | 'gang' | 'chi' | 'pass' }
  | { type: 'game_end'; reason: 'draw' | 'hu'; winnerSeat?: SeatIndex; loserSeat?: SeatIndex; winTile?: TileId; tai?: TaiResult; winnerHand?: TileId[]; winnerMelds?: Meld[]; scores?: Array<{ seat: SeatIndex; name: string; score: number }>; zimoRake?: number; deltas?: Array<{ seat: SeatIndex; delta: number }> }
  | { type: 'turn_timer'; seat: SeatIndex; thinkMs: number; baseMs: number; startAt: number }
  | { type: 'score_update'; score: number }
  | { type: 'result_closed_all' }
