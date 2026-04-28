import { WebSocketServer, type WebSocket } from 'ws'
import { randomUUID } from 'node:crypto'
import type { ClientMessage, ServerMessage, SeatIndex } from './game/types.js'
import { RoomManager, type ServerPlayer } from './room.js'
import { login as authLogin, verifyToken, makeToken, getProfile } from './auth.js'

const PORT = parseInt(process.env.PORT ?? '8080', 10)
const wss = new WebSocketServer({ port: PORT })
const rooms = new RoomManager()

interface Session {
  id: string
  name: string
  socket: WebSocket
  authedName?: string   // 已登入的帳號名
  avatar?: 0 | 1 | 2 | 3
}

const sessions: Map<WebSocket, Session> = new Map()

console.log(`[Server] Mahjong relay listening on port ${PORT}`)

wss.on('connection', (socket) => {
  const id = randomUUID()
  const session: Session = { id, name: `訪客`, socket }
  sessions.set(socket, session)

  console.log(`[Server] + ${id} connected (total: ${sessions.size})`)
  sendTo(socket, { type: 'welcome', playerId: id })

  socket.on('message', (data) => {
    let msg: ClientMessage
    try {
      msg = JSON.parse(data.toString())
    } catch {
      sendTo(socket, { type: 'error', message: 'Invalid JSON' })
      return
    }
    handleMessage(session, msg)
  })

  socket.on('close', () => {
    console.log(`[Server] - ${session.id} disconnected`)
    const room = rooms.getPlayerRoom(session.id)
    if (room) {
      room.setDisconnected(session.id)
      room.removePlayer(session.id)
      rooms.clearPlayerRoom(session.id)
      if (room.isEmpty()) {
        console.log(`[Server] room ${room.code} empty, removing`)
        rooms.deleteRoom(room.code)
      } else {
        room.broadcast({ type: 'room_update', room: room.toState() })
      }
    }
    sessions.delete(socket)
  })
})

function sendTo(socket: WebSocket, msg: ServerMessage) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg))
}

function handleMessage(sess: Session, msg: ClientMessage) {
  switch (msg.type) {
    case 'hello':
      sess.name = (msg.name ?? '').slice(0, 12).trim() || '訪客'
      break

    case 'create_room': {
      const room = rooms.createRoom()
      const p: ServerPlayer = {
        id: sess.id, name: sess.name, seat: 0 as SeatIndex, isBot: false, socket: sess.socket,
        authedName: sess.authedName,
      }
      room.addPlayer(p)
      rooms.setPlayerRoom(sess.id, room.code)
      console.log(`[Server] ${sess.name} created room ${room.code}`)
      room.broadcast({ type: 'room_update', room: room.toState() })
      break
    }

    case 'join_room': {
      const room = rooms.getRoom(msg.code)
      if (!room) return sendTo(sess.socket, { type: 'error', message: '房號不存在' })
      if (room.isFull()) return sendTo(sess.socket, { type: 'error', message: '房間已滿' })
      if (room.phase !== 'lobby') return sendTo(sess.socket, { type: 'error', message: '對局已開始' })
      const p: ServerPlayer = {
        id: sess.id, name: sess.name, seat: 0 as SeatIndex, isBot: false, socket: sess.socket,
        authedName: sess.authedName,
      }
      room.addPlayer(p)
      rooms.setPlayerRoom(sess.id, room.code)
      console.log(`[Server] ${sess.name} joined ${room.code}`)
      room.broadcast({ type: 'room_update', room: room.toState() })
      break
    }

    case 'quick_match': {
      const room = rooms.findOrCreateQuickMatchRoom()
      const p: ServerPlayer = {
        id: sess.id, name: sess.name, seat: 0 as SeatIndex, isBot: false, socket: sess.socket,
        authedName: sess.authedName,
      }
      room.addPlayer(p)
      rooms.setPlayerRoom(sess.id, room.code)
      console.log(`[Server] ${sess.name} quick-matched -> ${room.code}`)
      room.broadcast({ type: 'room_update', room: room.toState() })
      break
    }

    case 'list_rooms': {
      sess.name = msg.name
      const list = rooms.listJoinableRooms()
      sess.socket.send(JSON.stringify({ type: 'room_list', rooms: list }))
      break
    }

    case 'login': {
      const u = authLogin(msg.name, msg.password)
      if (!u) {
        sess.socket.send(JSON.stringify({ type: 'auth_result', ok: false, error: '帳號或密碼錯誤' }))
        return
      }
      sess.authedName = u.name
      sess.name = u.name
      sess.avatar = u.avatar
      const token = makeToken(u.name)
      sess.socket.send(JSON.stringify({
        type: 'auth_result', ok: true, token,
        profile: { name: u.name, avatar: u.avatar, score: u.score },
      }))
      break
    }

    case 'auth': {
      const name = verifyToken(msg.token)
      if (!name) {
        sess.socket.send(JSON.stringify({ type: 'auth_result', ok: false, error: 'Token 失效' }))
        return
      }
      const u = getProfile(name)
      if (!u) {
        sess.socket.send(JSON.stringify({ type: 'auth_result', ok: false, error: '帳號不存在' }))
        return
      }
      sess.authedName = u.name
      sess.name = u.name
      sess.avatar = u.avatar
      sess.socket.send(JSON.stringify({
        type: 'auth_result', ok: true,
        profile: { name: u.name, avatar: u.avatar, score: u.score },
      }))
      break
    }

    case 'set_settings': {
      const room = rooms.getPlayerRoom(sess.id)
      if (!room) return
      if (room.hostId !== sess.id) return // 只有房主可改
      if (room.phase !== 'lobby') return  // 開始後鎖定
      room.setSettings(msg.base, msg.taiPt)
      room.broadcast({ type: 'room_update', room: room.toState() })
      break
    }

    case 'leave_room': {
      const room = rooms.getPlayerRoom(sess.id)
      if (!room) return
      room.removePlayer(sess.id)
      rooms.clearPlayerRoom(sess.id)
      if (room.isEmpty()) {
        rooms.deleteRoom(room.code)
      } else {
        room.broadcast({ type: 'room_update', room: room.toState() })
      }
      break
    }

    case 'add_bot': {
      const room = rooms.getPlayerRoom(sess.id)
      if (!room) return
      if (room.hostId !== sess.id) {
        return sendTo(sess.socket, { type: 'error', message: '只有房主可以加入 AI' })
      }
      if (room.isFull()) return sendTo(sess.socket, { type: 'error', message: '房間已滿' })
      const botCount = room.players.filter(p => p.isBot).length + 1
      const bot: ServerPlayer = {
        id: `bot-${randomUUID().slice(0, 8)}`,
        name: `AI-${botCount}`,
        seat: 0 as SeatIndex,
        isBot: true,
        socket: null,
      }
      room.addPlayer(bot)
      room.broadcast({ type: 'room_update', room: room.toState() })
      break
    }

    case 'start_game': {
      const room = rooms.getPlayerRoom(sess.id)
      if (!room) return
      if (room.hostId !== sess.id) {
        return sendTo(sess.socket, { type: 'error', message: '只有房主可以開始' })
      }
      if (room.players.length !== 4) {
        return sendTo(sess.socket, { type: 'error', message: '需要 4 人（可加 AI 補位）' })
      }
      console.log(`[Server] Starting game in room ${room.code}`)
      room.broadcast({ type: 'room_update', room: { ...room.toState(), phase: 'playing' } })
      room.startGame()
      break
    }

    case 'discard': {
      const room = rooms.getPlayerRoom(sess.id)
      if (!room) return
      const result = room.handleDiscard(sess.id, msg.tile)
      if (!result.ok) {
        sendTo(sess.socket, { type: 'error', message: result.error ?? '出牌失敗' })
      }
      break
    }

    case 'action': {
      const room = rooms.getPlayerRoom(sess.id)
      if (!room) return
      const result = room.handleAction(sess.id, msg.action, msg.chiIndex, msg.gangTile)
      if (!result.ok) {
        sendTo(sess.socket, { type: 'error', message: result.error ?? '動作失敗' })
      }
      break
    }

    case 'result_close': {
      const room = rooms.getPlayerRoom(sess.id)
      if (!room) return
      room.markResultClosed(sess.id)
      break
    }

    default:
      break
  }
}
