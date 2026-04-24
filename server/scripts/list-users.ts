import { listAllUsers } from '../src/auth.js'

const users = listAllUsers()
if (users.length === 0) {
  console.log('(無帳號)')
  process.exit(0)
}
const AVATAR_NAMES = ['貓', '熊貓', '狐狸', '熊']
console.log(`暱稱            | 頭像   | 點數    | 建立時間`)
console.log(`----------------|--------|---------|-------------------`)
for (const u of users) {
  const name = u.name.padEnd(16, ' ')
  const av = (AVATAR_NAMES[u.avatar] ?? '?').padEnd(6, ' ')
  const score = String(u.score).padStart(7, ' ')
  const created = new Date(u.createdAt).toISOString().replace('T', ' ').slice(0, 19)
  console.log(`${name}| ${av} | ${score} | ${created}`)
}
console.log(`共 ${users.length} 個帳號`)
