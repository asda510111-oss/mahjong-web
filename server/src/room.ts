import type { WebSocket } from 'ws'
import type {
  PlayerInfo, RoomState, SeatIndex, ServerMessage, PublicPlayerState, ActionOptions,
} from './game/types.js'
import { buildFullWall, shuffle, getTileDef, type TileId } from './game/tiles.js'
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

  // 多局制（一圈 = 4 局，莊家輪流）
  gameIndex: number = 0                           // 0-3，目前第幾局
  roundScores: Map<string, number> = new Map()   // 整圈累計得分
  nextGameTimer: NodeJS.Timeout | null = null

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
    if (!this.hostId) this.hostId = p.id
    return true
  }

  removePlayer(id: string) {
    this.players = this.players.filter(p => p.id !== id)
    if (this.hostId === id && this.players.length > 0) {
      const next = this.players.find(p => !p.isBot)
      this.hostId = next?.id ?? this.players[0].id
    }
    this.hands.delete(id)
    this.melds.delete(id)
  }

  setDisconnected(id: string) {
    const p = this.players.find(x => x.id === id)
    if (p) p.socket = null
  }

  getPlayer(id: string) { return this.players.find(p => p.id === id) }
  getPlayerBySeat(s: SeatIndex) { return this.players.find(p => p.seat === s) }

  toState(): RoomState {
    const players: PlayerInfo[] = this.players.map(p => ({
      id: p.id, name: p.name, seat: p.seat, isBot: p.isBot,
      isConnected: p.isBot ? true : p.socket !== null,
    }))
    return { code: this.code, players, phase: this.phase, hostId: this.hostId }
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
    this.dealerSeat = this.gameIndex as SeatIndex
    this.currentTurnSeat = this.dealerSeat
    const dealerExtra = this.wall.shift()
    if (dealerExtra) h[this.dealerSeat].push(dealerExtra)

    this.broadcast({
      type: 'game_start',
      seed: Math.floor(Math.random() * 1_000_000),
      gameIndex: this.gameIndex,
      dealerSeat: this.dealerSeat,
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
    // 暗槓 / 加槓先不支援（Batch B）
    if (action === 'pass') {
      // 等同直接等待該家打牌；這裡不做事，UI 應該直接打牌
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

      const opt: ActionOptions = {
        canHu: canHu([...hand, tile], mc),
        canPeng: canPeng(hand, tile),
        canGangExposed: canGangExposed(hand, tile),
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
    // 倒數計時暫停中：不啟動、不廣播、不自動 pass
    this.clearResponseTimer(p.id)
    void this.handleResponseTimeout
    return
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

    // 全 pass → 下一家摸牌
    this.advanceToNextDraw(pending.bySeat)
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
    // 從牌尾補摸 + 補花
    const replacement = this.drawFromTail(pid)
    this.sendTo(pid, { type: 'hand_update', hand })
    this.broadcastPublicState()
    this.currentTurnSeat = p.seat
    this.justDrawnBy = pid
    this.justDrawnTile = replacement
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

    // 摸牌（遇花補花）
    let drawnTile: TileId | null = null
    while (true) {
      const t = this.wall.shift()
      if (!t) {
        this.broadcast({ type: 'game_end', reason: 'draw', scores: this.buildScoresPayload() })
        this.scheduleNextGame()
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
            this.broadcast({ type: 'game_end', reason: 'draw', scores: this.buildScoresPayload() })
            this.scheduleNextGame()
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
    if (!p.isBot && selfOpts.canHu) {
      this.sendTo(p.id, { type: 'action_options', options: selfOpts })
    }

    if (p.isBot) {
      this.scheduleBotDiscard(seat)
    } else {
      this.startTurnTimer(seat)
    }
  }

  // ========= 計時器 =========
  // 倒數計時暫停中：保留框架但不啟動、不廣播、不自動出牌
  private startTurnTimer(_seat: SeatIndex) {
    this.stopTurnTimer()
    // 保留 handleTurnTimeout 參考，之後要重新開啟計時時直接改這裡
    void this.handleTurnTimeout
    return
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
    const tai = calculateTai({
      hand,
      melds,
      isZimo,
      winTile,
      seatWind: winnerSeat,
      isDealer: winnerSeat === this.dealerSeat,
      consecutiveDealer: 0,
    })
    // 計分：底 1 + 台 tai.total
    const pts = 1 + tai.total
    for (const p of this.players) {
      if (p.seat === winnerSeat) {
        this.addScore(p.id, isZimo ? pts * 3 : pts)
      } else if (isZimo || p.seat === loserSeat) {
        this.addScore(p.id, -pts)
      }
    }
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
    })
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
  }

  // 本局結束 → 決定下一局 / 結束整圈
  private scheduleNextGame() {
    this.stopTurnTimer()
    for (const pid of this.responseTimerIds.keys()) this.clearResponseTimer(pid)
    this.responseStartAt.clear()
    this.pendingDiscard = null

    if (this.gameIndex >= 3) {
      // 四局結束 → 整圈結束
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

    // 延遲 6 秒讓玩家看胡牌 / 流局結果，再開下一局
    if (this.nextGameTimer) clearTimeout(this.nextGameTimer)
    this.nextGameTimer = setTimeout(() => {
      if (this.players.length !== 4) return
      this.gameIndex++
      this.dealNewGame()
    }, 6000)
  }

  private broadcastPublicState() {
    const states: PublicPlayerState[] = this.players.map(p => ({
      seat: p.seat,
      handCount: (this.hands.get(p.id) ?? []).length,
      melds: (this.melds.get(p.id) ?? []).filter(m => m.type !== 'flower').concat(
        (this.melds.get(p.id) ?? []).filter(m => m.type === 'flower')
      ),
      discards: this.discards[p.seat] ?? [],
    }))
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
  private genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let s = ''; for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)]
    return s
  }
}
