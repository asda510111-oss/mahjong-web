import { useEffect, useState } from 'react'
import Tile from './Tile'
import TableSeat from './TableSeat'
import CenterArea from './CenterArea'
import ActionBar from './ActionBar'
import TimerDisplay from './TimerDisplay'
import type { RoomState, SeatIndex, PublicPlayerState, ActionOptions } from '../game/types'
import { SEAT_LABELS } from '../game/types'
import type { TileId } from '../game/tiles'
import { sortHand } from '../game/tiles'
import { getTingTiles } from '../game/rules'
import type { DiscardMap } from '../App'
import catAvatar from '../assets/avatars/cat.svg'
import pandaAvatar from '../assets/avatars/panda.svg'
import foxAvatar from '../assets/avatars/fox.svg'
import bearAvatar from '../assets/avatars/bear.svg'

interface Props {
  room: RoomState
  myPlayerId: string
  mySeat: SeatIndex | null
  myHand: TileId[]
  discards: DiscardMap
  publicStates: PublicPlayerState[]
  wallRemaining: number
  currentTurn: SeatIndex | null
  dealerSeat: SeatIndex | null
  isMyTurn: boolean
  actionOptions: ActionOptions | null
  lastDrawn: TileId | null
  lastDiscardSeat: SeatIndex | null
  turnTimer: { seat: SeatIndex; thinkMs: number; baseMs: number; startAt: number } | null
  gameIndex: number
  consecutiveDealer: number
  roundScores: Array<{ seat: SeatIndex; name: string; score: number }> | null
  onLeave: () => void
  onAddBot: () => void
  onStart: () => void
  onDiscard: (tile: TileId) => void
  onAction: (action: 'pass' | 'hu' | 'peng' | 'gang' | 'chi', chiIndex?: number) => void
}

const SEAT_AVATARS = [catAvatar, pandaAvatar, foxAvatar, bearAvatar]

export default function GameRoom({
  room, myPlayerId, mySeat, myHand, discards, publicStates = [], wallRemaining,
  currentTurn, dealerSeat, isMyTurn, actionOptions, lastDrawn, lastDiscardSeat, turnTimer,
  gameIndex, consecutiveDealer, roundScores,
  onLeave, onAddBot, onStart, onDiscard, onAction,
}: Props) {
  const isHost = room.hostId === myPlayerId
  const playerCount = room.players.length

  // 兩段式打牌：第一次點抬起，再點才打出
  // 用索引追蹤（同張牌可能有多張，不能只用 id）
  // key: "sorted-<idx>" 或 "drawn"
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // 不是自己回合時清除選擇
  useEffect(() => {
    if (!isMyTurn) setSelectedKey(null)
  }, [isMyTurn])

  useEffect(() => {
    // 只有正式開始遊戲（非 lobby）才鎖定畫面，避免大廳手機無法滑動
    if (room.phase === 'lobby') {
      document.body.classList.remove('in-game')
      return
    }
    document.body.classList.add('in-game')
    return () => { document.body.classList.remove('in-game') }
  }, [room.phase])

  // 整體遊戲畫面自適應：以 1280×760 為設計尺寸，等比縮放至視窗
  useEffect(() => {
    const DESIGN_W = 1280
    const DESIGN_H = 760
    const update = () => {
      const s = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H)
      document.documentElement.style.setProperty('--game-scale', String(s))
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      document.documentElement.style.removeProperty('--game-scale')
    }
  }, [])

  const handleTileClick = (tile: TileId, key: string) => {
    if (!isMyTurn) return
    if (selectedKey === key) {
      onDiscard(tile)
      setSelectedKey(null)
    } else {
      setSelectedKey(key)
    }
  }

  // 將手牌分成「已排序的」＋「剛摸的一張」放右邊
  let sortedHand: TileId[]
  let drawnTile: TileId | null = null
  if (lastDrawn && myHand.includes(lastDrawn)) {
    const idx = myHand.indexOf(lastDrawn)
    const rest = [...myHand.slice(0, idx), ...myHand.slice(idx + 1)]
    sortedHand = sortHand(rest)
    drawnTile = lastDrawn
  } else {
    sortedHand = sortHand(myHand)
  }

  // 推算出「目前懸空」的牌 id —— 用來在中央高光相同牌
  let selectedTileId: TileId | null = null
  if (selectedKey) {
    if (selectedKey === 'drawn' && drawnTile) selectedTileId = drawnTile
    else if (selectedKey.startsWith('s-')) {
      const idx = parseInt(selectedKey.slice(2), 10)
      if (idx >= 0 && idx < sortedHand.length) selectedTileId = sortedHand[idx]
    }
  }

  // 聽牌預覽：打出後聽、或本身聽牌狀態
  const myPub = publicStates.find(ps => ps.seat === mySeat)
  const myMeldCount = (myPub?.melds ?? []).filter(m => m.type !== 'flower').length
  let tingTiles: TileId[] = []
  if (selectedTileId) {
    const remaining = [...myHand]
    const idx = remaining.indexOf(selectedTileId)
    if (idx >= 0) remaining.splice(idx, 1)
    tingTiles = getTingTiles(remaining, myMeldCount)
  } else if (myHand.length > 0) {
    const expected = (5 - myMeldCount) * 3 + 1
    if (myHand.length === expected) {
      tingTiles = getTingTiles(myHand, myMeldCount)
    }
  }
  const countRemainingTile = (tile: TileId): number => {
    let seen = 0
    for (const t of myHand) if (t === tile) seen++
    if (selectedTileId && tile === selectedTileId) seen--
    for (const s of [0, 1, 2, 3] as const) {
      for (const t of (discards[s] ?? [])) if (t === tile) seen++
    }
    for (const pub of publicStates) {
      for (const m of pub.melds) {
        for (const t of m.tiles) if (t === tile) seen++
      }
    }
    return Math.max(0, 4 - seen)
  }

  const inGame = room.phase === 'playing' || room.phase === 'ended'

  // 依我的座位計算其他三家相對位置（逆時針：下家=右、對家=上、上家=左）
  const pivot: SeatIndex = mySeat ?? 0
  const topSeat = ((pivot + 2) % 4) as SeatIndex
  const leftSeat = ((pivot + 3) % 4) as SeatIndex
  const rightSeat = ((pivot + 1) % 4) as SeatIndex
  const bottomSeat = pivot

  const getPlayer = (s: SeatIndex) => room.players.find(p => p.seat === s)
  const getPub = (s: SeatIndex) => publicStates.find(ps => ps.seat === s)

  // 局數 + 連莊同一行：例「東1局 連1」
  const ROUND_WINDS = ['東', '南', '西', '北'] as const
  const roundIdx = Math.floor((gameIndex ?? 0) / 4) % 4
  const gameInRound = ((gameIndex ?? 0) % 4) + 1
  const lianSuffix = (consecutiveDealer ?? 0) > 0 ? ` 連${consecutiveDealer}` : ''
  const dealerLabel = `${ROUND_WINDS[roundIdx]}${gameInRound}局${lianSuffix}`

  const getScore = (seat: SeatIndex): number | null => {
    if (!roundScores) return null
    const entry = roundScores.find(s => s.seat === seat)
    return entry?.score ?? null
  }

  // ===== Lobby view =====
  if (!inGame) {
    return (
      <div className="room lobby">
        <div className="room-header">
          <div>
            <div className="small">房號</div>
            <div className="code">{room.code}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="small">狀態</div>
            <div>等待開始</div>
          </div>
          <button onClick={onLeave} style={{ background: '#777', color: 'white' }}>離開</button>
        </div>

        <div className="lobby-seats">
          {[0, 1, 2, 3].map((i) => {
            const seat = i as SeatIndex
            const p = getPlayer(seat)
            return (
              <div key={seat} className={`lobby-seat ${!p ? 'empty' : ''}`}>
                <div className="avatar big">{p ? <img src={SEAT_AVATARS[seat]} alt="" /> : '❓'}</div>
                <div>
                  <div className="seat-name">{p ? p.name : '等待加入...'}</div>
                  <div className="seat-sub">{SEAT_LABELS[seat]}{p?.isBot && ' 🤖'}</div>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
          {isHost && playerCount < 4 && <button onClick={onAddBot}>加入 AI 🤖</button>}
          {isHost && playerCount === 4 && <button onClick={onStart}>開始遊戲</button>}
          {!isHost && <span className="muted">等待房主開始...</span>}
        </div>
      </div>
    )
  }

  // ===== Game view =====
  const renderSeat = (position: 'top' | 'left' | 'right' | 'bottom', seat: SeatIndex) => {
    const p = getPlayer(seat)
    if (!p) return <div className={`table-seat pos-${position} empty`}>空座</div>
    return (
      <TableSeat
        position={position}
        player={p}
        seat={seat}
        publicState={getPub(seat)}
        isDealer={dealerSeat === seat}
        isTurn={currentTurn === seat}
        isMe={seat === mySeat}
        score={getScore(seat)}
      />
    )
  }

  return (
    <div className="room">
      <div className="rotate-hint">
        <div className="icon">📱</div>
        <div>請將手機轉為橫向</div>
        <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>橫向遊玩視野更好</div>
      </div>
      <div className="room-header">
        <div>
          <div className="small">房號</div>
          <div className="code">{room.code}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div className="small">狀態</div>
          <div>
            {isMyTurn ? '🎯 輪到你' : `等 ${SEAT_LABELS[currentTurn ?? 0]} 出牌...`}
            {room.phase === 'ended' && ' · 結束'}
          </div>
        </div>
        <button onClick={onLeave} style={{ background: '#777', color: 'white' }}>離開</button>
      </div>

      <div className="table-wrapper">
        {/* 紅色毛氈背景層：左上角對齊上方木框最左點 */}
        <div className="felt-bg" aria-hidden="true" />
        {/* 除錯用座標刻度尺（以 table-wrapper 中心為 0,0） */}
        <div className="debug-ruler" aria-hidden="true">
          <div className="ruler ruler-x">
            {Array.from({ length: 121 }, (_, i) => (i - 60) * 10).map(v => (
              <span
                key={`x${v}`}
                className={`tick ${v % 50 === 0 ? 'major' : 'minor'}`}
                style={{ left: `calc(50% + ${v}px)` }}
              >
                {v % 50 === 0 ? v : ''}
              </span>
            ))}
          </div>
          <div className="ruler ruler-y">
            {Array.from({ length: 81 }, (_, i) => (i - 40) * 10).map(v => (
              <span
                key={`y${v}`}
                className={`tick ${v % 50 === 0 ? 'major' : 'minor'}`}
                style={{ top: `calc(50% - ${v}px)` }}
              >
                {v % 50 === 0 ? v : ''}
              </span>
            ))}
          </div>
          <div className="axis axis-x" />
          <div className="axis axis-y" />
        </div>
        {/* 自家吃/碰/槓/花 副子區：花補到最左，其餘依序排列 */}
        <div className="my-melds">
          {[
            ...(myPub?.melds ?? []).filter(m => m.type === 'flower'),
            ...(myPub?.melds ?? []).filter(m => m.type !== 'flower'),
          ].map((m, mi) => (
            <div key={mi} className={`meld-group ${m.type === 'flower' ? 'flower' : ''}`}>
              {m.tiles.map((t, ti) => (
                <Tile key={`${t}-${ti}`} id={t} disabled />
              ))}
            </div>
          ))}
        </div>
        {/* 計時框 */}
        <div className="timer-frame">
          {turnTimer && mySeat !== null && turnTimer.seat === mySeat && (
            <TimerDisplay
              thinkMs={turnTimer.thinkMs}
              baseMs={turnTimer.baseMs}
              startAt={turnTimer.startAt}
            />
          )}
        </div>

        {/* 對家吃/碰/槓/花 副子區（鏡像邏輯） */}
        <div className="top-melds">
          {[
            ...(getPub(topSeat)?.melds ?? []).filter(m => m.type === 'flower'),
            ...(getPub(topSeat)?.melds ?? []).filter(m => m.type !== 'flower'),
          ].map((m, mi) => (
            <div key={mi} className={`meld-group ${m.type === 'flower' ? 'flower' : ''}`}>
              {m.tiles.map((t, ti) => (
                <Tile key={`${t}-${ti}`} id={t} disabled />
              ))}
            </div>
          ))}
        </div>
        {/* 上家吃/碰/槓/花 副子區 */}
        <div className="left-melds">
          {[
            ...(getPub(leftSeat)?.melds ?? []).filter(m => m.type === 'flower'),
            ...(getPub(leftSeat)?.melds ?? []).filter(m => m.type !== 'flower'),
          ].map((m, mi) => (
            <div key={mi} className={`meld-group ${m.type === 'flower' ? 'flower' : ''}`}>
              {m.tiles.map((t, ti) => (
                <Tile key={`${t}-${ti}`} id={t} disabled />
              ))}
            </div>
          ))}
        </div>
        {/* 下家吃/碰/槓/花 副子區 */}
        <div className="right-melds">
          {[
            ...(getPub(rightSeat)?.melds ?? []).filter(m => m.type === 'flower'),
            ...(getPub(rightSeat)?.melds ?? []).filter(m => m.type !== 'flower'),
          ].map((m, mi) => (
            <div key={mi} className={`meld-group ${m.type === 'flower' ? 'flower' : ''}`}>
              {m.tiles.map((t, ti) => (
                <Tile key={`${t}-${ti}`} id={t} disabled />
              ))}
            </div>
          ))}
        </div>
        {/* 中央資訊覆蓋層：牌桌兩條對角線交點 */}
        <div className="table-center-info">
          <div className="center-round">{dealerLabel}</div>
          <div className="center-wall-num">{`餘${String(wallRemaining).padStart(2, '0')}`}</div>
          <span className={`wind-corner wind-bl ${dealerSeat === 0 ? 'dealer' : ''}`}>東</span>
          <span className={`wind-corner wind-br ${dealerSeat === 1 ? 'dealer' : ''}`}>南</span>
          <span className={`wind-corner wind-tr ${dealerSeat === 2 ? 'dealer' : ''}`}>西</span>
          <span className={`wind-corner wind-tl ${dealerSeat === 3 ? 'dealer' : ''}`}>北</span>
          {/* 回合光條：當前回合那家風 → 下家風之間顯示金色閃爍光條 */}
          {currentTurn !== null && (
            <div className={`turn-light-bar bar-${['bottom','right','top','left'][currentTurn]}`} aria-hidden="true" />
          )}
        </div>
        <div className="wood-edge wood-left" aria-hidden="true" />
        <div className="wood-edge wood-right" aria-hidden="true" />
        <div className="table-grid">
          <div className="grid-top">{renderSeat('top', topSeat)}</div>
          <div className="grid-left">{renderSeat('left', leftSeat)}</div>
          <div className="grid-center">
            <CenterArea
              wallRemaining={wallRemaining}
              dealerLabel={dealerLabel}
              topDiscards={discards[topSeat] ?? []}
              leftDiscards={discards[leftSeat] ?? []}
              rightDiscards={discards[rightSeat] ?? []}
              botDiscards={discards[bottomSeat] ?? []}
              highlightTile={selectedTileId}
              glowSeat={lastDiscardSeat}
              topSeat={topSeat}
              leftSeat={leftSeat}
              rightSeat={rightSeat}
              bottomSeat={bottomSeat}
            />
          </div>
          <div className="grid-right">{renderSeat('right', rightSeat)}</div>
          <div className="grid-bottom">{renderSeat('bottom', bottomSeat)}</div>
        </div>
      </div>

      {/* 動作按鈕 */}
      {actionOptions && <ActionBar options={actionOptions} onAction={onAction} />}


      {/* 聽牌預覽區：第一行「聽」，第二行聽的牌 + 牌正下方剩餘張數；無牌時隱藏 */}
      {tingTiles.length > 0 && (
        <div className="ting-preview-zone">
          <div className="ting-preview-label">聽</div>
          <div className="ting-preview-tiles">
            {tingTiles.map((t, i) => {
              const remain = countRemainingTile(t)
              return (
                <span key={`${t}-${i}`} className={`ting-preview-item ${remain === 0 ? 'dead' : ''}`}>
                  <Tile id={t} disabled />
                  <span className="ting-preview-count">{remain}</span>
                </span>
              )
            })}
          </div>
        </div>
      )}
      {/* 固定底部手牌 */}
      <div className={`hand-fixed ${isMyTurn ? 'my-turn' : ''}`}>
        <div className="hand-hint">
          {mySeat !== null && `你是 ${SEAT_LABELS[mySeat]}家`}
          {' · '}
          手牌 {sortedHand.length + (drawnTile ? 1 : 0)} 張
          {isMyTurn && ' · 點擊打出'}
        </div>
        <div className="hand">
          {sortedHand.map((t, idx) => {
            const key = `s-${idx}`
            return (
              <Tile
                key={`${t}-${idx}`}
                id={t}
                onClick={isMyTurn ? () => handleTileClick(t, key) : undefined}
                disabled={!isMyTurn}
                selected={selectedKey === key}
              />
            )
          })}
          {drawnTile && (
            <>
              <div className="hand-gap" aria-hidden="true" />
              <Tile
                key={`drawn-${drawnTile}`}
                id={drawnTile}
                onClick={isMyTurn ? () => handleTileClick(drawnTile!, 'drawn') : undefined}
                disabled={!isMyTurn}
                selected={selectedKey === 'drawn'}
              />
            </>
          )}
          {sortedHand.length === 0 && !drawnTile && <span className="muted">（尚未發牌）</span>}
        </div>
      </div>
    </div>
  )
}
