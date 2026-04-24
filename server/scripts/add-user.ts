#!/usr/bin/env tsx
// CLI: npm run add-user -- <name> <password> <avatar 0-3>
import { adminAddUser } from '../src/auth.js'

const [, , name, password, avatarStr] = process.argv
if (!name || !password || !avatarStr) {
  console.error('Usage: npm run add-user -- <name> <password> <avatar 0-3>')
  process.exit(1)
}
const avatar = Number(avatarStr)
if (![0, 1, 2, 3].includes(avatar)) {
  console.error('avatar must be 0 (貓) / 1 (熊貓) / 2 (狐狸) / 3 (熊)')
  process.exit(1)
}
try {
  const u = adminAddUser(name, password, avatar as 0 | 1 | 2 | 3)
  console.log(`✓ 新增成功: ${u.name} (avatar=${u.avatar}, score=${u.score})`)
} catch (e: any) {
  console.error(`✗ ${e.message}`)
  process.exit(1)
}
