import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const DATA_FILE = resolve(process.cwd(), 'data', 'users.json')
const SECRET = process.env.AUTH_SECRET || 'dev-only-secret-change-me'

export interface UserRecord {
  name: string
  hash: string    // hex
  salt: string    // hex
  avatar: 0 | 1 | 2 | 3
  score: number
  createdAt: number
}

interface Db { users: Record<string, UserRecord> }

function load(): Db {
  if (!existsSync(DATA_FILE)) return { users: {} }
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf-8'))
  } catch {
    return { users: {} }
  }
}
function save(db: Db) {
  mkdirSync(dirname(DATA_FILE), { recursive: true })
  writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8')
}

function hashPassword(pw: string, salt: string) {
  return scryptSync(pw, salt, 64).toString('hex')
}

function sign(payload: string) {
  return createHmac('sha256', SECRET).update(payload).digest('hex')
}

/** Token 格式：name.timestamp.signature */
export function makeToken(name: string): string {
  const ts = Date.now().toString()
  const payload = `${name}.${ts}`
  return `${payload}.${sign(payload)}`
}

export function verifyToken(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [name, ts, sig] = parts
  const payload = `${name}.${ts}`
  const expected = sign(payload)
  try {
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  // 30 天過期
  if (Date.now() - Number(ts) > 30 * 24 * 3600 * 1000) return null
  return name
}

export function validName(name: string) {
  return /^\S+$/.test(name) && name.length >= 2 && name.length <= 16
}

export function login(name: string, password: string): UserRecord | null {
  const db = load()
  const u = db.users[name]
  if (!u) return null
  const h = hashPassword(password, u.salt)
  if (h !== u.hash) return null
  return u
}

/** 由 CLI 呼叫：建立新帳號 */
export function adminAddUser(name: string, password: string, avatar: 0 | 1 | 2 | 3): UserRecord {
  if (!validName(name)) throw new Error('Invalid name')
  if (password.length < 4) throw new Error('Password too short')
  if (![0, 1, 2, 3].includes(avatar)) throw new Error('Invalid avatar')
  const db = load()
  if (db.users[name]) throw new Error('Name already exists')
  const salt = randomBytes(16).toString('hex')
  const hash = hashPassword(password, salt)
  const rec: UserRecord = { name, hash, salt, avatar, score: 10000, createdAt: Date.now() }
  db.users[name] = rec
  save(db)
  return rec
}

export function getProfile(name: string): UserRecord | null {
  return load().users[name] ?? null
}

export function addScore(name: string, delta: number) {
  const db = load()
  const u = db.users[name]
  if (!u) return
  u.score += delta
  save(db)
}

// ===== 管理 API =====
export function listAllUsers(): UserRecord[] {
  const db = load()
  return Object.values(db.users)
}

export function setScore(name: string, score: number) {
  const db = load()
  const u = db.users[name]
  if (!u) throw new Error(`帳號不存在: ${name}`)
  u.score = score
  save(db)
  return u
}

export function resetScore(name: string) {
  return setScore(name, 10000)
}

export function deleteUser(name: string) {
  const db = load()
  if (!db.users[name]) throw new Error(`帳號不存在: ${name}`)
  delete db.users[name]
  save(db)
}

export function setAvatar(name: string, avatar: 0 | 1 | 2 | 3) {
  const db = load()
  const u = db.users[name]
  if (!u) throw new Error(`帳號不存在: ${name}`)
  u.avatar = avatar
  save(db)
  return u
}

export function setPassword(name: string, newPassword: string) {
  if (newPassword.length < 4) throw new Error('Password too short')
  const db = load()
  const u = db.users[name]
  if (!u) throw new Error(`帳號不存在: ${name}`)
  const salt = randomBytes(16).toString('hex')
  u.salt = salt
  u.hash = hashPassword(newPassword, salt)
  save(db)
  return u
}
