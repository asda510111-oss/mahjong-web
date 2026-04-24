import { setAvatar } from '../src/auth.js'

const [, , name, avatarStr] = process.argv
if (!name || !avatarStr) {
  console.error('Usage: npm run set-avatar -- <name> <avatar 0-3>')
  process.exit(1)
}
const avatar = Number(avatarStr)
if (![0, 1, 2, 3].includes(avatar)) {
  console.error('avatar must be 0 (貓) / 1 (熊貓) / 2 (狐狸) / 3 (熊)')
  process.exit(1)
}
try {
  const u = setAvatar(name, avatar as 0 | 1 | 2 | 3)
  console.log(`✓ ${u.name} 頭像改為 ${avatar}`)
} catch (e: any) {
  console.error(`✗ ${e.message}`)
  process.exit(1)
}
