import { useEffect, useRef, useState } from 'react'
import MainMenu from './components/MainMenu'
import GameRoom from './components/GameRoom'
import HuResult from './components/HuResult'
import RoundEnd from './components/RoundEnd'
import { gameClient, resolveServerUrl, type ConnectionStatus } from './net/ws'
import type { RoomState, SeatIndex, ServerMessage, PublicPlayerState, ActionOptions } from './game/types'
import type { TileId } from './game/tiles'
import type { Meld, TaiResult } from './game/rules'
import { playSound, unlockAudio } from './utils/sounds'

export type DiscardMap = Record<number, TileId[]>
const EMPTY_DISCARDS: DiscardMap = { 0: [], 1: [], 2: [], 3: [] }

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [room, setRoom] = useState<RoomState | null>(null)
  const [myId, setMyId] = useState<string>('')
  const [myHand, setMyHand] = useState<TileId[]>([])
  const [discards, setDiscards] = useState<DiscardMap>(EMPTY_DISCARDS)
  const [publicStates, setPublicStates] = useState<PublicPlayerState[]>([])
  const [wallRemaining, setWallRemaining] = useState<number>(0)
  const [currentTurn, setCurrentTurn] = useState<SeatIndex | null>(null)
  const [dealerSeat, setDealerSeat] = useState<SeatIndex | null>(null)
  const [actionOptions, setActionOptions] = useState<ActionOptions | null>(null)
  const [lastDrawn, setLastDrawn] = useState<TileId | null>(null)
  const [lastDiscardSeat, setLastDiscardSeat] = useState<SeatIndex | null>(null)
  const [turnTimer, setTurnTimer] = useState<null | { seat: SeatIndex; thinkMs: number; baseMs: number; startAt: number }>(null)
  const [gameIndex, setGameIndex] = useState<number>(0)
  const [roundScores, setRoundScores] = useState<Array<{ seat: SeatIndex; name: string; score: number }> | null>(null)
  const [roundEnd, setRoundEnd] = useState<null | { scores: Array<{ seat: SeatIndex; name: string; score: number }> }>(null)
  const [huResult, setHuResult] = useState<null | {
    winnerSeat: SeatIndex
    winnerName: string
    loserSeat?: SeatIndex
    loserName?: string
    winTile: TileId
    tai: TaiResult
    hand: TileId[]
    melds: Meld[]
  }>(null)
  const [error, setError] = useState<string>('')
  const [notice, setNotice] = useState<string>('')

  const myIdRef = useRef('')
  const roomRef = useRef<RoomState | null>(null)
  useEffect(() => { myIdRef.current = myId }, [myId])
  useEffect(() => { roomRef.current = room }, [room])

  useEffect(() => {
    // iOS Safari 需要使用者互動後才能播放音效：第一次點擊/觸控時解鎖
    const unlock = () => {
      unlockAudio()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('touchstart', unlock)
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('touchstart', unlock, { once: true })

    const offStatus = gameClient.onStatusChange(setStatus)
    gameClient.connect(resolveServerUrl()).catch((e) => {
      console.error(e)
      setError('無法連到伺服器，請檢查是否已啟動。')
    })

    const off = gameClient.onMessage((msg: ServerMessage) => {
      console.log('[recv]', msg)
      switch (msg.type) {
        case 'welcome':
          setMyId(msg.playerId)
          break
        case 'room_update':
          setRoom(msg.room)
          setError('')
          if (msg.room.phase === 'lobby') {
            setMyHand([])
            setDiscards(EMPTY_DISCARDS)
            setPublicStates([])
            setCurrentTurn(null)
            setDealerSeat(null)
            setActionOptions(null)
            setLastDiscardSeat(null)
            setTurnTimer(null)
            setGameIndex(0)
            setRoundScores(null)
            setRoundEnd(null)
            setNotice('')
          }
          break
        case 'error':
          setError(msg.message)
          setTimeout(() => setError(''), 3000)
          break
        case 'game_start':
          setDiscards(EMPTY_DISCARDS)
          setPublicStates([])
          setActionOptions(null)
          setGameIndex(msg.gameIndex)
          setDealerSeat(msg.dealerSeat)
          setRoundEnd(null)
          setNotice(`第 ${msg.gameIndex + 1} 局開始！`)
          setTimeout(() => setNotice(''), 2000)
          break
        case 'round_end':
          setRoundScores(msg.scores)
          setRoundEnd({ scores: msg.scores })
          break
        case 'deal':
          setMyHand(msg.hand)
          setDealerSeat(msg.dealerSeat)
          break
        case 'turn':
          setCurrentTurn(msg.seat)
          // 新的回合開始，舊的倒數應被新 turn_timer 覆蓋；若該家是 bot 不會收到 turn_timer
          setTurnTimer(null)
          break
        case 'turn_timer':
          setTurnTimer({ seat: msg.seat, thinkMs: msg.thinkMs, baseMs: msg.baseMs, startAt: msg.startAt })
          break
        case 'tile_drawn':
          if (msg.tile) {
            setMyHand((h) => [...h, msg.tile!])
            // 判斷是不是我摸的
            const meSeat0 = roomRef.current?.players.find(p => p.id === myIdRef.current)?.seat
            if (meSeat0 === msg.seat) setLastDrawn(msg.tile)
          }
          break
        case 'tile_discarded':
          setDiscards((d) => ({ ...d, [msg.seat]: [...(d[msg.seat] ?? []), msg.tile] }))
          setLastDiscardSeat(msg.seat)
          // 如果是我自己打的，從手牌移掉
          {
            const r = roomRef.current
            const meId = myIdRef.current
            const meSeat = r?.players.find((p) => p.id === meId)?.seat
            if (meSeat === msg.seat) {
              setMyHand((h) => {
                const idx = h.indexOf(msg.tile)
                if (idx < 0) return h
                const next = [...h]
                next.splice(idx, 1)
                return next
              })
              // 自己打出後清掉「剛摸的牌」標記
              setLastDrawn(null)
            }
            // 其他人打牌時，清除自己上一輪的選項（安全起見）
            setActionOptions(null)
          }
          break
        case 'hand_update':
          setMyHand(msg.hand)
          // 碰/槓/吃後手牌重組，清掉標記
          setLastDrawn(null)
          break
        case 'meld_formed':
          // 由 public_state 統一同步，這裡暫不處理
          break
        case 'public_state':
          setPublicStates(msg.states)
          setWallRemaining(msg.wallRemaining)
          // 以伺服器為準同步棄牌堆（吃/碰/槓會 pop 掉被取走的那張）
          setDiscards(() => {
            const next: DiscardMap = { 0: [], 1: [], 2: [], 3: [] }
            for (const s of msg.states) next[s.seat] = [...(s.discards ?? [])]
            return next
          })
          break
        case 'action_options':
          setActionOptions(msg.options)
          break
        case 'action_taken':
          setActionOptions(null)
          if (msg.action !== 'pass') {
            const actionLabel: Record<string, string> = { hu: '胡', peng: '碰', gang: '槓', chi: '吃' }
            setNotice(`${['東','南','西','北'][msg.seat]}家 ${actionLabel[msg.action]}！`)
            setTimeout(() => setNotice(''), 1500)
            // 播放對應音效
            if (msg.action === 'chi' || msg.action === 'peng' || msg.action === 'gang' || msg.action === 'hu') {
              playSound(msg.action)
            }
          }
          break
        case 'game_end':
          setCurrentTurn(null)
          setActionOptions(null)
          if (msg.scores) setRoundScores(msg.scores)
          if (msg.reason === 'draw') {
            setNotice('流局')
          } else if (msg.winnerSeat !== undefined && msg.tai && msg.winnerHand && msg.winnerMelds && msg.winTile) {
            const r = roomRef.current
            const winner = r?.players.find(p => p.seat === msg.winnerSeat)
            const loser = msg.loserSeat !== undefined ? r?.players.find(p => p.seat === msg.loserSeat) : undefined
            setHuResult({
              winnerSeat: msg.winnerSeat,
              winnerName: winner?.name ?? '',
              loserSeat: msg.loserSeat,
              loserName: loser?.name,
              winTile: msg.winTile,
              tai: msg.tai,
              hand: msg.winnerHand,
              melds: msg.winnerMelds,
            })
          }
          break
      }
    })

    return () => {
      off()
      offStatus()
    }
  }, [])

  const handleCreateRoom = (name: string) => {
    gameClient.send({ type: 'hello', name })
    gameClient.send({ type: 'create_room' })
  }
  const handleJoinRoom = (name: string, code: string) => {
    gameClient.send({ type: 'hello', name })
    gameClient.send({ type: 'join_room', code })
  }
  const handleQuickMatch = (name: string) => {
    gameClient.send({ type: 'hello', name })
    gameClient.send({ type: 'quick_match' })
  }
  const handleLeave = () => {
    gameClient.send({ type: 'leave_room' })
    setRoom(null)
    setMyHand([])
    setDiscards(EMPTY_DISCARDS)
    setPublicStates([])
    setCurrentTurn(null)
    setDealerSeat(null)
    setActionOptions(null)
  }
  const handleAddBot = () => gameClient.send({ type: 'add_bot' })
  const handleStart = () => gameClient.send({ type: 'start_game' })
  const handleDiscard = (tile: TileId) => gameClient.send({ type: 'discard', tile })
  const handleAction = (action: 'pass' | 'hu' | 'peng' | 'gang' | 'chi', chiIndex?: number) => {
    gameClient.send({ type: 'action', action, chiIndex })
    setActionOptions(null) // 立即收起按鈕
  }

  const mySeat = room?.players.find((p) => p.id === myId)?.seat ?? null
  const isMyTurn = currentTurn !== null && currentTurn === mySeat

  return (
    <>
      {room ? (
        <GameRoom
          room={room}
          myPlayerId={myId}
          mySeat={mySeat}
          myHand={myHand}
          discards={discards}
          publicStates={publicStates}
          wallRemaining={wallRemaining}
          lastDrawn={lastDrawn}
          lastDiscardSeat={lastDiscardSeat}
          turnTimer={turnTimer}
          gameIndex={gameIndex}
          roundScores={roundScores}
          currentTurn={currentTurn}
          dealerSeat={dealerSeat}
          isMyTurn={isMyTurn}
          actionOptions={actionOptions}
          onLeave={handleLeave}
          onAddBot={handleAddBot}
          onStart={handleStart}
          onDiscard={handleDiscard}
          onAction={handleAction}
        />
      ) : (
        <MainMenu
          status={status}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onQuickMatch={handleQuickMatch}
        />
      )}
      {error && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(217, 75, 75, 0.95)', padding: '0.75rem 1.25rem',
          borderRadius: 10, maxWidth: '90vw', textAlign: 'center', zIndex: 100,
        }}>
          {error}
        </div>
      )}
      {huResult && (
        <HuResult {...huResult} onClose={() => setHuResult(null)} />
      )}
      {roundEnd && !huResult && (
        <RoundEnd scores={roundEnd.scores} onClose={() => setRoundEnd(null)} />
      )}
      {notice && (
        <div style={{
          position: 'fixed', top: '40%', left: '50%', transform: 'translate(-50%, -50%)',
          background: 'rgba(0, 0, 0, 0.85)', padding: '1rem 2rem',
          borderRadius: 12, fontSize: '1.5rem', fontWeight: 600, zIndex: 100,
          textAlign: 'center', maxWidth: '90vw',
        }}>
          {notice}
        </div>
      )}
    </>
  )
}
