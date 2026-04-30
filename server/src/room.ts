import type { WebSocket } from 'ws'
import type {
  PlayerInfo, RoomState, SeatIndex, ServerMessage, PublicPlayerState, ActionOptions,
} from './game/types.js'
import { buildFullWall, shuffle, getTileDef, type TileId } from './game/tiles.js'
import { addScore as authAddScore, getProfile as authGetProfile } from './auth.js'
import {
  canHu, canPeng, canGangExposed, canGangConcealed, canGangAdded, canChi, calculateTai,
  type Meld,
} from './game/rules.js'

export interface ServerPlayer {
  id: string
  name: string
  seat: SeatIndex
  isBot: boolean
  socket: WebSocket | null
  authedName?: string   // 已登入帳號名，用於累計分數
}

const BOT_DISCARD_MS = 800
const BOT_DECISION_MS = 500
// 行動超時：給人類玩家足夠時間預覽吃牌組合
const ACTION_TIMEOUT_MS = 30000
// 出牌計時
const THINK_MS = 5000   // 思考時間 5 秒（每次出牌回滿）
const BASE_SEC = 20     // 基礎時間 20 秒（用完不回滿，直到該局結束）

interface PendingDiscard {
  tile: TileId
  bySeat: SeatIndex
  // 對每位有選項的玩家追蹤回應
  options: Map<string, ActionOptions>
  received: Map<string, { action: 'pass' | 'hu' | 'peng' | 'gang' | 'chi'; chiIndex?: number }>
  timeoutHandle: NodeJS.Timeout | null
}

export class Room {
  code: string
  players: ServerPlayer[] = []
  phase: 'lobby' | 'playing' | 'ended' = 'lobby'
  hostId = ''
  // 房間設定（底/台/將數）
  base: 300 | 200 = 200
  taiPt: 100 | 50 = 50
  jiang: 1 | 2 = 1  // 1 將=4 圈=16 局；2 將=8 圈=32 局

  wall: TileId[] = []
  hands: Map<string, TileId[]> = new Map()
  melds: Map<string, Meld[]> = new Map()
  dealerSeat: SeatIndex = 0
  currentTurnSeat: SeatIndex = 0
  discards: Record<number, TileId[]> = { 0: [], 1: [], 2: [], 3: [] }
  pendingDiscard: PendingDiscard | null = null
  // 摸到的最新那張（供自摸胡判斷 + 超時自動打出）
  justDrawnBy: string | null = null
  justDrawnTile: TileId | null = null

  // 計時相關
  playerBase: Map<string, number> = new Map()    // 每位玩家剩餘基礎時間（秒）
  turnStartAt: number = 0                         // 當前回合計時起點（ms 時間戳）
  turnTimerId: NodeJS.Timeout | null = null

  // 多局制（4 圈 = 16 局，莊家輪流；連莊時 gameIndex 不前進）
  gameIndex: number = 0                           // 0-15
  consecutiveDealer: number = 0                   // 連莊次數（0 = 首次）
  dealerKeepNext: boolean = false                 // 下一局是否連莊（endGame 時決定）
  lastDrawWasGang: boolean = false                // 剛剛補槓牌（給槓上自摸判定）
  isQiangGangInProgress: boolean = false          // 搶槓胡進行中（加槓時被搶胡）
  roundScores: Map<string, number> = new Map()
  // 抽東累計（一場 4 圈 16 局內累加，達上限後不再抽）
  zimoRakeTotal: number = 0
  // 中途離開懲罰：一場僅第一位離場的真人玩家扣 100 點
  firstLeaverPenalized: boolean = false
  nextGameTimer: NodeJS.Timeout | null = null
  // 結算畫面已按關閉的玩家集合（每局重置，bot 自動加入）
  resultClosed: Set<string> = new Set()
  // Bot 的 in-memory 點數（每個 bot id → 分數），起始 10000，不持久化
  botScores: Map<string, number> = new Map()
  // 斷線重連寬限 timer（player id → timeout）；到期才真正 removePlayer
  reconnectTimers: Map<string, NodeJS.Timeout> = new Map()

  constructor(code: string) { this.code = code }

  isFull() { return this.players.length >= 4 }
  isEmpty() { return this.players.filter(p => !p.isBot).length === 0 }

  addPlayer(p: ServerPlayer): boolean {
    if (this.isFull()) return false
    const used = new Set(this.players.map(x => x.seat))
    for (let i = 0; i < 4; i++) {
      if (!used.has(i as SeatIndex)) { p.seat = i as SeatIndex; break }
    }
    this.players.push(p)
    this.melds.set(p.id, [])
    if (p.isBot) this.botScores.set(p.id, 10000)
    if (!this.hostId) this.hostId = p.id
    return true
  }

  removePlayer(id: string) {
    // 中途離開懲罰：一場僅第一位離場的真人登入玩家扣 100 點
    if (this.phase === 'playing' && !this.firstLeaverPenalized) {
      const p = this.players.find(x => x.id === id)
      if (p && !p.isBot && p.authedName) {
        authAddScore(p.authedName, -100)
        this.firstLeaverPenalized = true
        console.log(`[Server] ${p.authedName} left mid-game, -100 score`)
        // 推送新點數給離開者（主動 leave 時 socket 還在；斷線時送會 noop）
        const profile = authGetProfile(p.authedName)
        if (profile) this.sendTo(id, { type: 'score_update', score: profile.score })
      }
    }
    this.players = this.players.filter(p => p.id !== id)
    if (this.hostId === id && this.players.length > 0) {
      const next = this.players.find(p => !p.isBot)
      this.hostId = next?.id ?? this.players[0].id
    }
    this.hands.delete(id)
    this.melds.delete(id)
  }

  // 回傳是否「應該立即 removePlayer」：對局中的登入玩家給 60 秒重連寬限
  setDisconnected(id: string): { shouldRemoveNow: boolean } {
    const p = this.players.find(x => x.id === id)
    if (!p) return { shouldRemoveNow: true }
    p.socket = null
    if (this.phase === 'playing' && p.authedName) {
      // 啟動 60 秒重連寬限：到期未接回才移除
      const existing = this.reconnectTimers.get(id)
      if (existing) clearTimeout(existing)
      const timer = setTimeout(() => {
        this.reconnectTimers.delete(id)
        this.removePlayer(id)
        if (this.isEmpty()) return
        this.broadcast({ type: 'room_update', room: this.toState() })
      }, 60000)
      this.reconnectTimers.set(id, timer)
      return { shouldRemoveNow: false }
    }
    return { shouldRemoveNow: true }
  }

  // 重連嘗試：在所有「對局中且有同 authedName 斷線位」中找回該玩家
  // 找到 → 接回 socket、清重連 timer，回傳原 player.id 與 room（caller 重發 state）
  tryReclaim(authedName: string, newSocket: WebSocket): { ok: boolean; playerId?: string } {
    if (this.phase !== 'playing') return { ok: false }
    const p = this.players.find(x => x.authedName === authedName && x.socket === null)
    if (!p) return { ok: false }
    p.socket = newSocket
    const timer = this.reconnectTimers.get(p.id)
    if (timer) {
      clearTimeout(timer)
      this.reconnectTimers.delete(p.id)
    }
    this.broadcast({ type: 'room_update', room: this.toState() })
    return { ok: true, playerId: p.id }
  }

  // 重連後重發必要 state：手牌、座位、副子、棄牌、目前回合
  resendStateForReclaim(playerId: string) {
    const p = this.getPlayer(playerId)
    if (!p) return
    // 1. room_update
    this.sendTo(p.id, { type: 'room_update', room: this.toState() })
    // 2. game_start（讓 client 知道 gameIndex / dealerSeat / consecutiveDealer）
    this.sendTo(p.id, {
      type: 'game_start',
      seed: 0,
      gameIndex: this.gameIndex,
      dealerSeat: this.dealerSeat,
      consecutiveDealer: this.consecutiveDealer,
    })
    // 3. 自家手牌
    const hand = this.hands.get(p.id) ?? []
    this.sendTo(p.id, { type: 'deal', hand, dealerSeat: this.dealerSeat })
    // 4. 公開狀態（含所有人手牌數、副子、棄牌、accountScore）
    const states: PublicPlayerState[] = this.players.map(pp => {
      const u = pp.authedName ? authGetProfile(pp.authedName) : null
      return {
        seat: pp.seat,
        handCount: (this.hands.get(pp.id) ?? []).length,
        melds: (this.melds.get(pp.id) ?? []).filter(m => m.type !== 'flower').concat(
          (this.melds.get(pp.id) ?? []).filter(m => m.type === 'flower')
        ),
        discards: this.discards[pp.seat] ?? [],
        accountScore: pp.isBot ? (this.botScores.get(pp.id) ?? 10000) : u?.score,
      }
    })
    this.sendTo(p.id, { type: 'public_state', states, wallRemaining: this.wall.length })
    // 5. 目前回合
    this.sendTo(p.id, { type: 'turn', seat: this.currentTurnSeat })
  }

  getPlayer(id: string) { return this.players.find(p => p.id === id) }
  getPlayerBySeat(s: SeatIndex) { return this.players.find(p => p.seat === s) }

  toState(): RoomState {
    const players: PlayerInfo[] = this.players.map(p => {
      const u = p.authedName ? authGetProfile(p.authedName) : null
      return {
        id: p.id, name: p.name, seat: p.seat, isBot: p.isBot,
        isConnected: p.isBot ? true : p.socket !== null,
        accountScore: p.isBot ? (this.botScores.get(p.id) ?? 10000) : u?.score,
      }
    })
    return { code: this.code, players, phase: this.phase, hostId: this.hostId, base: this.base, taiPt: this.taiPt, jiang: this.jiang }
  }

  setSettings(base: 300 | 200, _taiPt: 100 | 50, jiang?: 1 | 2) {
    // 底 300 + 台 100 / 底 200 + 台 50 綁定
    this.base = base
    this.taiPt = base === 300 ? 100 : 50
    if (jiang === 1 || jiang === 2) this.jiang = jiang
  }

  broadcast(msg: ServerMessage) {
    const data = JSON.stringify(msg)
    for (const p of this.players) {
      if (p.socket && p.socket.readyState === 1) p.socket.send(data)
    }
  }

  sendTo(id: string, msg: ServerMessage) {
    const p = this.getPlayer(id)
    if (p?.socket && p.socket.readyState === 1) p.socket.send(JSON.stringify(msg))
  }

  // ========= 遊戲流程 =========
  // 開新一圈：重置累計分數 + 發第一局
  startGame() {
    if (this.players.length !== 4) return
    this.gameIndex = 0
    this.consecutiveDealer = 0
    this.dealerSeat = 0 // 東家開局
    this.zimoRakeTotal = 0
    this.firstLeaverPenalized = false
    for (const t of this.reconnectTimers.values()) clearTimeout(t)
    this.reconnectTimers.clear()
    this.roundScores.clear()
    for (const p of this.players) this.roundScores.set(p.id, 0)
    if (this.nextGameTimer) clearTimeout(this.nextGameTimer)
    this.nextGameTimer = null
    this.dealNewGame()
  }

  // 發一局（內部）：用 this.gameIndex 當莊家座位；不重置 roundScores
  private dealNewGame() {
    if (this.players.length !== 4) return
    this.phase = 'playing'
    this.wall = shuffle(buildFullWall())
    this.discards = { 0: [], 1: [], 2: [], 3: [] }
    this.hands.clear()
    this.melds.clear()
    this.pendingDiscard = null
    this.justDrawnBy = null
    this.justDrawnTile = null
    this.stopTurnTimer()
    this.playerBase.clear()
    for (const p of this.players) {
      this.melds.set(p.id, [])
      this.playerBase.set(p.id, BASE_SEC)
    }

    // 發牌：每人 16 張，莊家 17 張
    const h: TileId[][] = [[], [], [], []]
    for (let i = 0; i < 16; i++) {
      for (let s = 0; s < 4; s++) {
        const t = this.wall.shift()
        if (t) h[s].push(t)
      }
    }
    // dealerSeat 由 scheduleNextGame 決定（連莊時不變），不再從 gameIndex 推算
    this.currentTurnSeat = this.dealerSeat
    const dealerExtra = this.wall.shift()
    if (dealerExtra) h[this.dealerSeat].push(dealerExtra)

    this.broadcast({
      type: 'game_start',
      seed: Math.floor(Math.random() * 1_000_000),
      gameIndex: this.gameIndex,
      dealerSeat: this.dealerSeat,
      consecutiveDealer: this.consecutiveDealer,
    })
    for (const p of this.players) {
      this.hands.set(p.id, h[p.seat])
      this.sendTo(p.id, { type: 'deal', hand: h[p.seat], dealerSeat: this.dealerSeat })
    }

    // 補花（輪流由莊家→北家）
    let changed = true
    while (changed) {
      changed = false
      for (let s = 0; s < 4; s++) {
        const p = this.getPlayerBySeat(s as SeatIndex)!
        const hand = this.hands.get(p.id)!
        let flowerIdx = hand.findIndex(t => getTileDef(t).isFlower)
        while (flowerIdx >= 0) {
          const flower = hand[flowerIdx]
          hand.splice(flowerIdx, 1)
          this.melds.get(p.id)!.push({ type: 'flower', tiles: [flower] })
          changed = true
          const rep = this.wall.pop() // 從牌尾補（王牌）
          if (rep) hand.push(rep)
          flowerIdx = hand.findIndex(t => getTileDef(t).isFlower)
        }
        this.sendTo(p.id, { type: 'hand_update', hand })
      }
    }

    this.broadcastPublicState()

    // 莊家先出牌（已有 17 張）
    // 檢查莊家是否自摸胡（開局天胡情況簡化略過）
    this.justDrawnBy = this.getPlayerBySeat(this.dealerSeat)!.id
    {
      const dh = this.hands.get(this.getPlayerBySeat(this.dealerSeat)!.id)!
      this.justDrawnTile = dh[dh.length - 1] ?? null
    }
    this.sendTurnOrAutoAction(this.dealerSeat)
  }

  // ========= 外部介面 =========
  handleDiscard(playerId: string, tile: TileId): { ok: boolean; error?: string } {
    if (this.phase !== 'playing') return { ok: false, error: '遊戲未進行' }
    if (this.pendingDiscard) return { ok: false, error: '等待其他玩家回應中' }
    const p = this.getPlayer(playerId)
    if (!p) return { ok: false, error: '不在房間' }
    if (p.seat !== this.currentTurnSeat) return { ok: false, error: '不是你的回合' }
    const hand = this.hands.get(p.id) ?? []
    if (!hand.includes(tile)) return { ok: false, error: '你沒有這張牌' }
    this.doDiscard(p, tile)
    return { ok: true }
  }

  // 實際執行打牌（已通過驗證，或由超時自動呼叫）
  private doDiscard(p: ServerPlayer, tile: TileId): void {
    const hand = this.hands.get(p.id) ?? []
    const idx = hand.indexOf(tile)
    if (idx < 0) return
    if (!p.isBot) this.settleTurnTimer(p.id)
    hand.splice(idx, 1)
    this.discards[p.seat].push(tile)
    this.justDrawnBy = null
    this.justDrawnTile = null
    this.broadcast({ type: 'tile_discarded', seat: p.seat, tile })
    this.broadcastPublicState()
    this.evaluateDiscard(tile, p.seat)
  }

  handleAction(
    playerId: string,
    action: 'pass' | 'hu' | 'peng' | 'gang' | 'chi',
    chiIndex?: number,
    gangTile?: TileId,
  ): { ok: boolean; error?: string } {
    // 自己回合的主動動作：自摸胡、暗槓、加槓
    if (!this.pendingDiscard) {
      return this.handleSelfAction(playerId, action, gangTile)
    }
    // 對別人棄牌的回應
    const pending = this.pendingDiscard
    if (!pending.options.has(playerId)) {
      return { ok: false, error: '你沒有可做的動作' }
    }
    if (pending.received.has(playerId)) {
      return { ok: false, error: '已回應過' }
    }
    const p = this.getPlayer(playerId)
    if (p && !p.isBot) this.settleResponseTimer(playerId)
    pending.received.set(playerId, { action, chiIndex })
    this.maybeResolvePending()
    return { ok: true }
  }

  private handleSelfAction(playerId: string, action: string, _gangTile?: TileId): { ok: boolean; error?: string } {
    const p = this.getPlayer(playerId)
    if (!p) return { ok: false, error: '不在房間' }
    if (p.seat !== this.currentTurnSeat) return { ok: false, error: '不是你的回合' }
    const hand = this.hands.get(p.id)!
    const melds = this.melds.get(p.id)!
    const mc = countMeldsForHu(melds)

    if (action === 'hu') {
      // 自摸胡
      if (!canHu(hand, mc)) return { ok: false, error: '還沒聽胡' }
      this.endGameWithHu(p.seat, undefined, hand[hand.length - 1])
      return { ok: true }
    }

    if (action === 'gang') {
      // 先嘗試暗槓（手中 4 張同牌）
      const concealed = canGangConcealed(hand)
      if (concealed.length > 0) {
        const gangTile = concealed[0]
        // 從手牌移除 4 張
        for (let i = 0; i < 4; i++) {
          const idx = hand.indexOf(gangTile)
          if (idx >= 0) hand.splice(idx, 1)
        }
        const meld: Meld = { type: 'gang_concealed', tiles: [gangTile, gangTile, gangTile, gangTile], fromSeat: p.seat }
        this.melds.get(p.id)!.push(meld)
        this.broadcast({ type: 'meld_formed', seat: p.seat, meld })
        this.broadcast({ type: 'action_taken', seat: p.seat, action: 'gang' })
        // 先送不含補牌的 hand_update，再 drawFromTail 補牌，最後 tile_drawn 讓 client 加牌（避免重複）
        this.sendTo(p.id, { type: 'hand_update', hand })
        const replacement = this.drawFromTail(p.id)
        if (replacement) this.sendTo(p.id, { type: 'tile_drawn', seat: p.seat, tile: replacement })
        this.broadcastPublicState()
        this.justDrawnBy = p.id
        this.justDrawnTile = replacement
        this.lastDrawWasGang = true
        // 補牌後留在原家繼續行動
        this.sendTurnOrAutoAction(p.seat)
        return { ok: true }
      }
      // 加槓（手中 1 張 + 已碰過的同牌）→ 先檢查其他家是否能搶槓胡
      const added = canGangAdded(hand, melds)
      if (added.length > 0) {
        const gangTile = added[0]
        // 搶槓胡檢查：若任一他家 hand+gangTile 可胡 → 進入搶槓流程
        const qiangHuCandidates: Array<{ pid: string; seat: SeatIndex }> = []
        for (const other of this.players) {
          if (other.id === p.id) continue
          const oHand = this.hands.get(other.id) ?? []
          const oMelds = this.melds.get(other.id) ?? []
          const oMc = countMeldsForHu(oMelds)
          if (canHu([...oHand, gangTile], oMc)) {
            qiangHuCandidates.push({ pid: other.id, seat: other.seat })
          }
        }
        if (qiangHuCandidates.length > 0) {
          // 建立搶槓 pending：給可胡者發送 action_options（只有 canHu）
          this.isQiangGangInProgress = true
          for (const c of qiangHuCandidates) {
            const cp = this.getPlayer(c.pid)!
            const opt: ActionOptions = {
              canHu: true, canPeng: false, canGangExposed: false,
              canGangConcealed: [], canGangAdded: [],
              canChi: [], fromTile: gangTile, fromSeat: p.seat,
            }
            if (!cp.isBot) this.sendTo(c.pid, { type: 'action_options', options: opt })
          }
          // 以 pendingDiscard 結構紀錄（重用 pass/hu 解析）
          const pendingOptions = new Map<string, ActionOptions>()
          for (const c of qiangHuCandidates) {
            pendingOptions.set(c.pid, {
              canHu: true, canPeng: false, canGangExposed: false,
              canGangConcealed: [], canGangAdded: [],
              canChi: [], fromTile: gangTile, fromSeat: p.seat,
            })
          }
          const received = new Map<string, { action: 'pass' | 'hu' | 'peng' | 'gang' | 'chi' }>()
          const timeoutHandle = setTimeout(() => {
            // 超時未胡 → 完成加槓
            this.completeGangAdded(p, gangTile)
          }, ACTION_TIMEOUT_MS)
          this.pendingDiscard = {
            tile: gangTile, bySeat: p.seat, options: pendingOptions,
            received, timeoutHandle,
          }
          return { ok: true }
        }
        // 無人能搶槓 → 直接完成加槓
        this.completeGangAdded(p, gangTile)
        return { ok: true }
      }
      return { ok: false, error: '無可槓牌' }
    }

    if (action === 'pass') {
      // UI 直接打牌即可
      return { ok: true }
    }
    return { ok: false, error: '此動作尚未支援' }
  }

  // ========= 核心流程 =========

  // 某家打完牌，判斷其他三家可做動作
  private evaluateDiscard(tile: TileId, bySeat: SeatIndex) {
    const options = new Map<string, ActionOptions>()
    for (const p of this.players) {
      if (p.seat === bySeat) continue
      const hand = this.hands.get(p.id)!
      const melds = this.melds.get(p.id)!
      const mc = countMeldsForHu(melds)
      const isNext = ((bySeat + 1) % 4) === p.seat

      // 台麻規則：下家（next）可吃但不可槓上家的棄牌
      const opt: ActionOptions = {
        canHu: canHu([...hand, tile], mc),
        canPeng: canPeng(hand, tile),
        canGangExposed: !isNext && canGangExposed(hand, tile),
        canGangConcealed: [],
        canGangAdded: [],
        canChi: isNext ? canChi(hand, tile) : [],
        fromTile: tile,
        fromSeat: bySeat,
      }
      if (opt.canHu || opt.canPeng || opt.canGangExposed || opt.canChi.length > 0) {
        options.set(p.id, opt)
      }
    }

    if (options.size === 0) {
      // 沒人可動作 → 下一家摸牌
      this.advanceToNextDraw(bySeat)
      return
    }

    // 建立 pending；每個人類玩家有各自的思考+基礎時間
    // 對 pendingDiscard 整體用 ACTION_TIMEOUT_MS 作為保險上限（30s）
    const timeoutHandle = setTimeout(() => this.timeoutPendingPass(), ACTION_TIMEOUT_MS)
    const received = new Map<string, { action: 'pass' | 'hu' | 'peng' | 'gang' | 'chi'; chiIndex?: number }>()
    this.pendingDiscard = { tile, bySeat, options, received, timeoutHandle }

    for (const [pid, opt] of options) {
      const p = this.getPlayer(pid)!
      if (p.isBot) {
        setTimeout(() => {
          if (!this.pendingDiscard) return
          if (this.pendingDiscard.received.has(pid)) return
          const decision = botDecideOnDiscard(opt)
          this.pendingDiscard.received.set(pid, decision)
          this.maybeResolvePending()
        }, BOT_DECISION_MS)
      } else {
        this.sendTo(pid, { type: 'action_options', options: opt })
        // 人類玩家：啟動該家自己的思考+基礎倒數（顯示倒數）
        this.startResponseTimer(p)
      }
    }
  }

  // 響應階段：單一玩家的倒數（以 action_taken/結算或超時而結束）
  private responseTimerIds: Map<string, NodeJS.Timeout> = new Map()
  private responseStartAt: Map<string, number> = new Map()

  private startResponseTimer(p: ServerPlayer) {
    this.clearResponseTimer(p.id)
    const baseSec = this.playerBase.get(p.id) ?? 0
    const baseMs = baseSec * 1000
    const startAt = Date.now()
    this.responseStartAt.set(p.id, startAt)
    this.sendTo(p.id, { type: 'turn_timer', seat: p.seat, thinkMs: THINK_MS, baseMs, startAt })
    const total = THINK_MS + baseMs
    const timer = setTimeout(() => this.handleResponseTimeout(p.id), total)
    this.responseTimerIds.set(p.id, timer)
  }

  private clearResponseTimer(pid: string) {
    const id = this.responseTimerIds.get(pid)
    if (id) clearTimeout(id)
    this.responseTimerIds.delete(pid)
  }

  private settleResponseTimer(pid: string) {
    this.clearResponseTimer(pid)
    const startAt = this.responseStartAt.get(pid)
    if (!startAt) return
    this.responseStartAt.delete(pid)
    const elapsed = Date.now() - startAt
    const over = elapsed - THINK_MS
    if (over > 0) {
      const cur = this.playerBase.get(pid) ?? 0
      this.playerBase.set(pid, Math.max(0, cur - Math.ceil(over / 1000)))
    }
  }

  private handleResponseTimeout(pid: string) {
    if (!this.pendingDiscard) return
    if (this.pendingDiscard.received.has(pid)) return
    // 時間用完 → 直接 pass
    this.playerBase.set(pid, 0)
    this.responseStartAt.delete(pid)
    this.pendingDiscard.received.set(pid, { action: 'pass' })
    this.maybeResolvePending()
  }

  private timeoutPendingPass() {
    if (!this.pendingDiscard) return
    // 尚未回應者一律 pass
    for (const [pid] of this.pendingDiscard.options) {
      if (!this.pendingDiscard.received.has(pid)) {
        this.pendingDiscard.received.set(pid, { action: 'pass' })
      }
    }
    this.maybeResolvePending()
  }

  // 所有人都回應了嗎？
  private maybeResolvePending() {
    const pd = this.pendingDiscard
    if (!pd) return
    if (pd.received.size < pd.options.size) return

    if (pd.timeoutHandle) clearTimeout(pd.timeoutHandle)
    // 清掉所有人類玩家未結算的響應計時器
    for (const [pid] of pd.options) this.settleResponseTimer(pid)
    const pending = pd
    this.pendingDiscard = null

    // 決定優先序：Hu > Gang/Peng > Chi
    // 胡：若多人可胡，由打牌者下家順時針最近者優先
    const huCandidates: string[] = []
    const gangCandidate: string[] = []
    const pengCandidate: string[] = []
    const chiCandidate: { pid: string; idx: number }[] = []
    for (const [pid, resp] of pending.received) {
      if (resp.action === 'hu') huCandidates.push(pid)
      else if (resp.action === 'gang') gangCandidate.push(pid)
      else if (resp.action === 'peng') pengCandidate.push(pid)
      else if (resp.action === 'chi') chiCandidate.push({ pid, idx: resp.chiIndex ?? 0 })
    }

    if (huCandidates.length > 0) {
      // 選離 bySeat 最近（順時針下家）
      const sorted = huCandidates.map(pid => this.getPlayer(pid)!).sort((a, b) => {
        const da = (a.seat - pending.bySeat + 4) % 4
        const db = (b.seat - pending.bySeat + 4) % 4
        return da - db
      })
      const winner = sorted[0]
      this.endGameWithHu(winner.seat, pending.bySeat, pending.tile)
      return
    }

    if (gangCandidate.length > 0) {
      const p = this.getPlayer(gangCandidate[0])!
      this.applyGangExposed(p.id, pending.tile, pending.bySeat)
      return
    }
    if (pengCandidate.length > 0) {
      const p = this.getPlayer(pengCandidate[0])!
      this.applyPeng(p.id, pending.tile, pending.bySeat)
      return
    }
    if (chiCandidate.length > 0) {
      const c = chiCandidate[0]
      this.applyChi(c.pid, pending.tile, pending.bySeat, c.idx)
      return
    }

    // 全 pass
    if (this.isQiangGangInProgress) {
      // 搶槓流程中沒人胡 → 完成加槓
      const p = this.getPlayerBySeat(pending.bySeat)!
      this.completeGangAdded(p, pending.tile)
      return
    }
    // 一般棄牌流程：下一家摸牌
    this.advanceToNextDraw(pending.bySeat)
  }

  // 加槓完成：實際升級牌組 + 補牌
  private completeGangAdded(p: ServerPlayer, gangTile: TileId) {
    this.pendingDiscard = null
    this.isQiangGangInProgress = false
    const hand = this.hands.get(p.id)!
    const melds = this.melds.get(p.id)!
    // 從手牌移除 1 張
    const idx = hand.indexOf(gangTile)
    if (idx >= 0) hand.splice(idx, 1)
    const pengIdx = melds.findIndex(m => m.type === 'peng' && m.tiles[0] === gangTile)
    if (pengIdx >= 0) {
      const originalFromSeat = melds[pengIdx].fromSeat ?? p.seat
      melds[pengIdx] = { type: 'gang_exposed', tiles: [gangTile, gangTile, gangTile, gangTile], fromSeat: originalFromSeat }
      this.broadcast({ type: 'meld_formed', seat: p.seat, meld: melds[pengIdx] })
    }
    this.broadcast({ type: 'action_taken', seat: p.seat, action: 'gang' })
    this.sendTo(p.id, { type: 'hand_update', hand })
    const replacement = this.drawFromTail(p.id)
    if (replacement) this.sendTo(p.id, { type: 'tile_drawn', seat: p.seat, tile: replacement })
    this.broadcastPublicState()
    this.justDrawnBy = p.id
    this.justDrawnTile = replacement
    this.lastDrawWasGang = true
    this.sendTurnOrAutoAction(p.seat)
  }

  private removeLastDiscard(fromSeat: SeatIndex, tile: TileId) {
    const pile = this.discards[fromSeat]
    if (pile.length && pile[pile.length - 1] === tile) {
      pile.pop()
    }
  }

  private applyPeng(pid: string, tile: TileId, fromSeat: SeatIndex) {
    const p = this.getPlayer(pid)!
    const hand = this.hands.get(pid)!
    // 從被碰者的棄牌堆移除最後一張（該被吃/碰/槓的牌），讓後續棄牌自然遞補其位置
    this.removeLastDiscard(fromSeat, tile)
    // 移除手牌中 2 張
    for (let i = 0; i < 2; i++) {
      const idx = hand.indexOf(tile)
      if (idx >= 0) hand.splice(idx, 1)
    }
    const meld: Meld = { type: 'peng', tiles: [tile, tile, tile], fromSeat }
    this.melds.get(pid)!.push(meld)
    this.broadcast({ type: 'meld_formed', seat: p.seat, meld })
    this.broadcast({ type: 'action_taken', seat: p.seat, action: 'peng' })
    this.sendTo(pid, { type: 'hand_update', hand })
    this.broadcastPublicState()
    // 碰完 → 換該家出牌（不摸）
    this.currentTurnSeat = p.seat
    this.justDrawnBy = null
    this.justDrawnTile = null
    this.sendTurnOrAutoAction(p.seat)
  }

  private applyGangExposed(pid: string, tile: TileId, fromSeat: SeatIndex) {
    const p = this.getPlayer(pid)!
    const hand = this.hands.get(pid)!
    this.removeLastDiscard(fromSeat, tile)
    for (let i = 0; i < 3; i++) {
      const idx = hand.indexOf(tile)
      if (idx >= 0) hand.splice(idx, 1)
    }
    const meld: Meld = { type: 'gang_exposed', tiles: [tile, tile, tile, tile], fromSeat }
    this.melds.get(pid)!.push(meld)
    this.broadcast({ type: 'meld_formed', seat: p.seat, meld })
    this.broadcast({ type: 'action_taken', seat: p.seat, action: 'gang' })
    // 先送 hand_update（無補牌），再 drawFromTail 補牌，最後 tile_drawn
    this.sendTo(pid, { type: 'hand_update', hand })
    const replacement = this.drawFromTail(pid)
    if (replacement) this.sendTo(pid, { type: 'tile_drawn', seat: p.seat, tile: replacement })
    this.broadcastPublicState()
    this.currentTurnSeat = p.seat
    this.justDrawnBy = pid
    this.justDrawnTile = replacement
    this.lastDrawWasGang = true
    this.sendTurnOrAutoAction(p.seat)
  }

  private applyChi(pid: string, tile: TileId, fromSeat: SeatIndex, chiIndex: number) {
    const p = this.getPlayer(pid)!
    const hand = this.hands.get(pid)!
    this.removeLastDiscard(fromSeat, tile)
    const opts = canChi(hand, tile)
    const chosen = opts[chiIndex] ?? opts[0]
    // chosen 是三張 id，其中一張是 tile（從棄牌來）
    const needFromHand = [...chosen]
    const tIdx = needFromHand.indexOf(tile)
    if (tIdx >= 0) needFromHand.splice(tIdx, 1)
    for (const t of needFromHand) {
      const idx = hand.indexOf(t)
      if (idx >= 0) hand.splice(idx, 1)
    }
    const meld: Meld = { type: 'chi', tiles: chosen, fromSeat }
    this.melds.get(pid)!.push(meld)
    this.broadcast({ type: 'meld_formed', seat: p.seat, meld })
    this.broadcast({ type: 'action_taken', seat: p.seat, action: 'chi' })
    this.sendTo(pid, { type: 'hand_update', hand })
    this.broadcastPublicState()
    this.currentTurnSeat = p.seat
    this.justDrawnBy = null
    this.justDrawnTile = null
    this.sendTurnOrAutoAction(p.seat)
  }

  // 從牌尾補摸（明槓/暗槓後）+ 摸到花繼續補
  private drawFromTail(pid: string): TileId | null {
    const hand = this.hands.get(pid)!
    while (true) {
      const t = this.wall.pop()
      if (!t) return null
      if (getTileDef(t).isFlower) {
        this.melds.get(pid)!.push({ type: 'flower', tiles: [t] })
        this.broadcast({ type: 'meld_formed', seat: this.getPlayer(pid)!.seat, meld: { type: 'flower', tiles: [t] } })
        continue
      }
      hand.push(t)
      return t
    }
  }

  // 下一家摸牌（從牌頭）+ 補花
  private advanceToNextDraw(prevSeat: SeatIndex) {
    const nextSeat = ((prevSeat + 1) % 4) as SeatIndex
    this.currentTurnSeat = nextSeat
    const p = this.getPlayerBySeat(nextSeat)!
    const hand = this.hands.get(p.id)!
    this.lastDrawWasGang = false  // 一般摸牌重置

    // 摸牌（遇花補花）
    let drawnTile: TileId | null = null
    while (true) {
      const t = this.wall.shift()
      if (!t) {
        this.dealerKeepNext = true // 流局連莊
        this.broadcast({ type: 'game_end', reason: 'draw', scores: this.buildScoresPayload() })
        this.scheduleNextGame({ isDraw: true })
        this.broadcast({ type: 'room_update', room: this.toState() })
        return
      }
      if (getTileDef(t).isFlower) {
        // 把花放進花牌副子
        this.melds.get(p.id)!.push({ type: 'flower', tiles: [t] })
        this.broadcast({ type: 'meld_formed', seat: p.seat, meld: { type: 'flower', tiles: [t] } })
        // 從牌尾補一張；若補到又是花就繼續補，直到拿到非花牌或牌山空
        let rep: TileId | undefined
        while (true) {
          rep = this.wall.pop()
          if (!rep) {
            this.dealerKeepNext = true // 流局連莊
            this.broadcast({ type: 'game_end', reason: 'draw', scores: this.buildScoresPayload() })
            this.scheduleNextGame({ isDraw: true })
            return
          }
          if (!getTileDef(rep).isFlower) break
          this.melds.get(p.id)!.push({ type: 'flower', tiles: [rep] })
          this.broadcast({ type: 'meld_formed', seat: p.seat, meld: { type: 'flower', tiles: [rep] } })
        }
        hand.push(rep)
        drawnTile = rep
        break
      }
      hand.push(t)
      drawnTile = t
      break
    }

    this.justDrawnBy = p.id
    this.justDrawnTile = drawnTile

    // 通知：本人看得到實際牌，其他人只看數字
    for (const pp of this.players) {
      if (pp.isBot) continue
      if (pp.id === p.id) {
        this.sendTo(pp.id, { type: 'tile_drawn', seat: nextSeat, tile: drawnTile! })
      } else {
        this.sendTo(pp.id, { type: 'tile_drawn', seat: nextSeat })
      }
    }
    this.broadcastPublicState()

    this.sendTurnOrAutoAction(nextSeat)
  }

  // 宣告輪次。若當前玩家可自摸胡 → 推送 action_options
  private sendTurnOrAutoAction(seat: SeatIndex) {
    this.broadcast({ type: 'turn', seat })
    const p = this.getPlayerBySeat(seat)!
    const hand = this.hands.get(p.id)!
    const melds = this.melds.get(p.id)!
    const mc = countMeldsForHu(melds)

    const selfOpts: ActionOptions = {
      canHu: canHu(hand, mc),
      canPeng: false,
      canGangExposed: false,
      canGangConcealed: canGangConcealed(hand),
      canGangAdded: canGangAdded(hand, melds),
      canChi: [],
    }
    // 進牌後若可胡、暗槓、加槓 → 送 action_options 讓玩家選
    const hasSelfOption = selfOpts.canHu
      || selfOpts.canGangConcealed.length > 0
      || selfOpts.canGangAdded.length > 0
    if (!p.isBot && hasSelfOption) {
      this.sendTo(p.id, { type: 'action_options', options: selfOpts })
    }

    if (p.isBot) {
      this.scheduleBotDiscard(seat)
    } else {
      this.startTurnTimer(seat)
    }
  }

  // ========= 計時器 =========
  private startTurnTimer(seat: SeatIndex) {
    this.stopTurnTimer()
    const p = this.getPlayerBySeat(seat)
    if (!p || p.isBot) return
    const baseSec = this.playerBase.get(p.id) ?? 0
    const baseMs = baseSec * 1000
    const startAt = Date.now()
    this.turnStartAt = startAt
    this.broadcast({ type: 'turn_timer', seat, thinkMs: THINK_MS, baseMs, startAt })
    const total = THINK_MS + baseMs
    this.turnTimerId = setTimeout(() => this.handleTurnTimeout(seat), total)
  }

  private stopTurnTimer() {
    if (this.turnTimerId) {
      clearTimeout(this.turnTimerId)
      this.turnTimerId = null
    }
  }

  // 停止計時 + 把超過思考時間的部分從基礎時間扣掉
  private settleTurnTimer(playerId: string) {
    this.stopTurnTimer()
    if (this.turnStartAt === 0) return
    const elapsedMs = Date.now() - this.turnStartAt
    this.turnStartAt = 0
    const overMs = elapsedMs - THINK_MS
    if (overMs > 0) {
      const cur = this.playerBase.get(playerId) ?? 0
      const newBase = Math.max(0, cur - Math.ceil(overMs / 1000))
      this.playerBase.set(playerId, newBase)
    }
  }

  // 時間到 → 自動打出「剛摸的那張」（找不到就打最右邊）
  private handleTurnTimeout(seat: SeatIndex) {
    if (this.phase !== 'playing') return
    if (this.currentTurnSeat !== seat) return
    if (this.pendingDiscard) return
    const p = this.getPlayerBySeat(seat)
    if (!p) return
    this.playerBase.set(p.id, 0)
    const hand = this.hands.get(p.id) ?? []
    if (hand.length === 0) return
    // 優先打剛摸到的牌；沒有（例如碰/吃後）就打最右邊
    let tile: TileId | null = null
    if (this.justDrawnBy === p.id && this.justDrawnTile && hand.includes(this.justDrawnTile)) {
      tile = this.justDrawnTile
    } else {
      tile = hand[hand.length - 1]
    }
    this.turnStartAt = 0
    this.doDiscard(p, tile)
  }

  private scheduleBotDiscard(seat: SeatIndex) {
    setTimeout(() => {
      if (this.phase !== 'playing') return
      if (this.currentTurnSeat !== seat) return
      if (this.pendingDiscard) return
      const p = this.getPlayerBySeat(seat)
      if (!p?.isBot) return
      const hand = this.hands.get(p.id)!
      if (hand.length === 0) return

      // Bot 自摸判斷：若可胡，直接胡
      const mc = countMeldsForHu(this.melds.get(p.id)!)
      if (canHu(hand, mc)) {
        this.handleAction(p.id, 'hu')
        return
      }
      // 否則打最右邊一張
      const tile = hand[hand.length - 1]
      this.handleDiscard(p.id, tile)
    }, BOT_DISCARD_MS)
  }

  private endGameWithHu(winnerSeat: SeatIndex, loserSeat: SeatIndex | undefined, winTile: TileId) {
    this.stopTurnTimer()
    for (const pid of this.responseTimerIds.keys()) this.clearResponseTimer(pid)
    this.responseStartAt.clear()
    const winner = this.getPlayerBySeat(winnerSeat)!
    const hand = [...(this.hands.get(winner.id) ?? [])]
    const isZimo = loserSeat === undefined
    if (!isZimo && !hand.includes(winTile)) hand.push(winTile)
    const melds = this.melds.get(winner.id) ?? []
    // 天地人胡判定
    const totalDiscards = (this.discards[0].length + this.discards[1].length
      + this.discards[2].length + this.discards[3].length)
    const isDealer = winnerSeat === this.dealerSeat
    // 是否尚無任何吃/碰/槓（花牌副子除外）→ 確保「第一巡」
    const noExposedMelds = this.players.every(pp => {
      const ms = this.melds.get(pp.id) ?? []
      return ms.every(m => m.type === 'flower')
    })
    const isTianHu = isZimo && isDealer && totalDiscards === 0
    // 地胡：閒家自摸、自己從未打過牌、無人吃碰槓
    const isDiHu = isZimo && !isDealer
      && (this.discards[winnerSeat]?.length ?? 0) === 0
      && noExposedMelds
    // 人胡：閒家放槍胡莊、莊家只打出 1 張、無人吃碰槓
    const isRenHu = !isZimo && !isDealer
      && loserSeat === this.dealerSeat
      && (this.discards[this.dealerSeat]?.length ?? 0) === 1
      && totalDiscards === 1
      && noExposedMelds
    // 槓上自摸：自摸 + 剛剛補槓牌
    const isGangShangZimo = isZimo && this.lastDrawWasGang
    // 海底撈月：自摸 + 剛摸完就沒牌了（wall 空）
    const isHaiDi = isZimo && this.wall.length === 0
    const tai = calculateTai({
      hand,
      melds,
      isZimo,
      winTile,
      seatWind: winnerSeat,
      roundWind: Math.floor(this.gameIndex / 4) % 4,
      isDealer,
      consecutiveDealer: this.consecutiveDealer,
      isTianHu,
      isDiHu,
      isRenHu,
      isGangShangZimo,
      isQiangGang: this.isQiangGangInProgress,
      isHaiDi,
    })
    // 連莊判斷：莊家贏 → 連莊；上限 10 次，連 10 後再胡也下莊
    const dealerWins = winnerSeat === this.dealerSeat
    this.dealerKeepNext = dealerWins && this.consecutiveDealer < 10

    // 計分：底 + 台 × 台數
    const pts = this.base + this.taiPt * tai.total
    // 莊家被胡時額外賠連莊台（連 N 拉 N = 2N+1 台 × 台點）
    const dealerPenalty = (!dealerWins && this.consecutiveDealer > 0)
      ? (this.taiPt * (2 * this.consecutiveDealer + 1))
      : 0
    // 胡莊：贏家不是莊家時，莊家被胡的那份額外多 1 台
    //   自摸：莊家本來就要付 → 多付 1*taiPt
    //   放炮且莊家是放炮者：放炮那份多付 1*taiPt
    //   放炮但放炮者非莊家：莊家本來不付 → 不適用
    const huDealerExtra = !dealerWins && (isZimo || loserSeat === this.dealerSeat)
      ? this.taiPt : 0

    // 記錄結算前各家累計分（後面減 before 算本局 delta，給前端動畫）
    const beforeScore = new Map<SeatIndex, number>()
    for (const p of this.players) beforeScore.set(p.seat, this.roundScores.get(p.id) ?? 0)
    // 抽東：自摸抽 100；若累計仍未達上限，依「已抽次數」動態 trigger 強制抽
    //   底 300（cap 500，5 次）：N=0 南4(7), N=1 北1(12), N=2 北2(13), N=3 北3(14), N=4 北4(15)
    //   底 200（cap 400，4 次）：N=0 北1(12), N=1 北2(13), N=2 北3(14), N=3 北4(15)
    const zimoRakeCap = this.base === 300 ? 500 : 400
    const zimoRakeRemaining = Math.max(0, zimoRakeCap - this.zimoRakeTotal)
    const rakedCount = Math.floor(this.zimoRakeTotal / 100)
    const forceRakeTrigger = this.base === 300
      ? (rakedCount === 0 ? 7 : 11 + rakedCount)
      : (12 + rakedCount)
    const inForceRakeRange = this.gameIndex >= forceRakeTrigger
    const zimoRake = (isZimo || inForceRakeRange) ? Math.min(100, zimoRakeRemaining) : 0
    this.zimoRakeTotal += zimoRake
    for (const p of this.players) {
      if (p.seat === winnerSeat) {
        // 贏家得分：基本分 + 胡莊額外 + 連莊賠償 - 抽東
        const base = isZimo ? pts * 3 : pts
        this.addScore(p.id, base + huDealerExtra + dealerPenalty - zimoRake)
      } else if (isZimo || p.seat === loserSeat) {
        // 付款者：閒家付 pts；莊家因胡莊多付 huDealerExtra
        let pay = pts
        if (p.seat === this.dealerSeat && !dealerWins) pay += huDealerExtra
        this.addScore(p.id, -pay)
      }
      // 莊家被胡（非贏家）→ 獨自扣連莊台（含莊家自己放炮的情況）
      if (!dealerWins && p.seat === this.dealerSeat && p.seat !== winnerSeat) {
        this.addScore(p.id, -dealerPenalty)
      }
    }
    // 算本局每家 delta（給前端動畫顯示 +N/-N）
    const deltas = this.players.map(p => ({
      seat: p.seat,
      delta: (this.roundScores.get(p.id) ?? 0) - (beforeScore.get(p.seat) ?? 0),
    }))
    // 結算後立刻廣播 public_state，讓 TableSeat.accountScore 同步更新
    this.broadcastPublicState()
    this.broadcast({
      type: 'game_end',
      reason: 'hu',
      winnerSeat,
      loserSeat,
      winTile,
      tai,
      winnerHand: hand,
      winnerMelds: melds,
      scores: this.buildScoresPayload(),
      zimoRake,
      deltas,
    })
    // 結算後重置搶槓標記與槓上自摸標記
    this.isQiangGangInProgress = false
    this.lastDrawWasGang = false
    this.scheduleNextGame()
  }

  private buildScoresPayload() {
    return this.players.map(p => ({
      seat: p.seat,
      name: p.name,
      score: this.roundScores.get(p.id) ?? 0,
    }))
  }

  private addScore(pid: string, pts: number) {
    this.roundScores.set(pid, (this.roundScores.get(pid) ?? 0) + pts)
    // 同時寫入持久化帳號（若有登入）；bot 累計到 in-memory botScores
    const p = this.getPlayer(pid)
    if (p?.authedName) authAddScore(p.authedName, pts)
    if (p?.isBot) {
      this.botScores.set(pid, (this.botScores.get(pid) ?? 10000) + pts)
    }
  }

  // 本局結束 → 決定下一局 / 結束整圈
  private scheduleNextGame(opts?: { isDraw?: boolean }) {
    this.stopTurnTimer()
    for (const pid of this.responseTimerIds.keys()) this.clearResponseTimer(pid)
    this.responseStartAt.clear()
    this.pendingDiscard = null

    // 連莊判斷（由 endGameWithHu/draw 設定 dealerKeepNext 後呼叫本函式）
    const willKeep = this.dealerKeepNext
    this.dealerKeepNext = false // reset flag for next round

    // 非連莊 + 已是最後一局 → 整場結束（1 將=16 局，2 將=32 局）
    if (!willKeep && this.gameIndex >= this.jiang * 16 - 1) {
      this.phase = 'ended'
      this.broadcast({
        type: 'round_end',
        scores: this.players.map(p => ({
          seat: p.seat,
          name: p.name,
          score: this.roundScores.get(p.id) ?? 0,
        })),
      })
      this.broadcast({ type: 'room_update', room: this.toState() })
      return
    }

    const advance = () => {
      if (this.players.length !== 4) return
      if (willKeep) {
        this.consecutiveDealer++
      } else {
        this.gameIndex++
        this.dealerSeat = ((this.dealerSeat + 1) % 4) as SeatIndex
        this.consecutiveDealer = 0
      }
      this.dealNewGame()
    }

    // 流局：跳過 HuResult 等待與動畫，固定 3 秒後直接進下一局
    if (opts?.isDraw) {
      if (this.nextGameTimer) clearTimeout(this.nextGameTimer)
      this.nextGameTimer = setTimeout(() => {
        this.nextGameTimer = null
        advance()
      }, 3000)
      return
    }

    // 胡牌：兩階段
    //   階段 1（等四家關 HuResult，最多 10 秒）→ 通知 client 開始跑分數動畫
    //   階段 2（動畫 ~2 秒 + 等 5 秒，固定 7 秒）→ 真正進下一局
    this.resultClosed = new Set(this.players.filter(p => p.isBot).map(p => p.id))
    const startAnimationPhase = () => {
      this.broadcast({ type: 'result_closed_all' })
      if (this.nextGameTimer) clearTimeout(this.nextGameTimer)
      this.nextGameTimer = setTimeout(() => {
        this.nextGameTimer = null
        advance()
      }, 7000)
    }
    this.nextGameAdvance = startAnimationPhase
    if (this.nextGameTimer) clearTimeout(this.nextGameTimer)
    this.nextGameTimer = setTimeout(() => {
      this.nextGameAdvance = null
      this.nextGameTimer = null
      startAnimationPhase()
    }, 10000)
    // 若全部都是 bot（人類已全部離開）則立即進階段 2
    this.tryAdvanceIfAllClosed()
  }

  private nextGameAdvance: (() => void) | null = null

  // 玩家按下結算關閉
  markResultClosed(playerId: string) {
    if (!this.nextGameAdvance) return
    this.resultClosed.add(playerId)
    this.tryAdvanceIfAllClosed()
  }

  private tryAdvanceIfAllClosed() {
    if (!this.nextGameAdvance) return
    const allClosed = this.players.every(p => this.resultClosed.has(p.id))
    if (allClosed) {
      const fn = this.nextGameAdvance
      this.nextGameAdvance = null
      if (this.nextGameTimer) { clearTimeout(this.nextGameTimer); this.nextGameTimer = null }
      fn()
    }
  }

  private broadcastPublicState() {
    const states: PublicPlayerState[] = this.players.map(p => {
      const u = p.authedName ? authGetProfile(p.authedName) : null
      return {
        seat: p.seat,
        handCount: (this.hands.get(p.id) ?? []).length,
        melds: (this.melds.get(p.id) ?? []).filter(m => m.type !== 'flower').concat(
          (this.melds.get(p.id) ?? []).filter(m => m.type === 'flower')
        ),
        discards: this.discards[p.seat] ?? [],
        // bot 用 in-memory 分數（起始 10000，每局累計，不持久化）；登入玩家用帳號 score
        accountScore: p.isBot ? (this.botScores.get(p.id) ?? 10000) : u?.score,
      }
    })
    this.broadcast({ type: 'public_state', states, wallRemaining: this.wall.length })
  }
}

// 計算副子數量（只算面子，花牌不算）
function countMeldsForHu(melds: Meld[]): number {
  return melds.filter(m => m.type !== 'flower').length
}

// AI 對他人棄牌的決策
import type { ActionOptions as AO } from './game/types.js'
function botDecideOnDiscard(opt: AO): { action: 'pass' | 'hu' | 'peng' | 'gang' | 'chi'; chiIndex?: number } {
  // 優先序：胡 > 槓 > 碰 > 過（暫不吃）
  if (opt.canHu) return { action: 'hu' }
  if (opt.canGangExposed) return { action: 'gang' }
  // 碰的機率：AI 有 60% 機率碰（避免每次都碰導致永遠不跑順子）
  if (opt.canPeng && Math.random() < 0.6) return { action: 'peng' }
  return { action: 'pass' }
}

// ================ RoomManager ================
export class RoomManager {
  private rooms = new Map<string, Room>()
  private playerRoom = new Map<string, string>()

  createRoom(): Room {
    let code: string
    do { code = this.genCode() } while (this.rooms.has(code))
    const r = new Room(code)
    this.rooms.set(code, r)
    return r
  }
  getRoom(code: string) { return this.rooms.get(code.toUpperCase()) }
  deleteRoom(code: string) { this.rooms.delete(code) }
  setPlayerRoom(playerId: string, code: string) { this.playerRoom.set(playerId, code) }
  clearPlayerRoom(playerId: string) { this.playerRoom.delete(playerId) }
  getPlayerRoom(playerId: string) {
    const c = this.playerRoom.get(playerId)
    return c ? this.rooms.get(c) : undefined
  }
  findOrCreateQuickMatchRoom() {
    for (const r of this.rooms.values()) if (r.phase === 'lobby' && !r.isFull()) return r
    return this.createRoom()
  }
  // 嘗試以 authedName 接回正在「對局中、斷線中」的位置
  tryReclaimByAuth(authedName: string, newSocket: WebSocket): { room: Room; playerId: string } | null {
    for (const r of this.rooms.values()) {
      const result = r.tryReclaim(authedName, newSocket)
      if (result.ok && result.playerId) {
        return { room: r, playerId: result.playerId }
      }
    }
    return null
  }

  // 列出可加入（lobby + 未滿）的房間
  listJoinableRooms() {
    const list: Array<{ code: string; players: number; hostName: string }> = []
    for (const r of this.rooms.values()) {
      if (r.phase !== 'lobby') continue
      if (r.isFull()) continue
      const host = r.players.find(p => p.id === r.hostId)
      list.push({
        code: r.code,
        players: r.players.length,
        hostName: host?.name ?? r.players[0]?.name ?? '?',
      })
    }
    return list
  }
  private genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let s = ''; for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)]
    return s
  }
}
