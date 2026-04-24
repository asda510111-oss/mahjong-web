import { setPassword } from '../src/auth.js'

const [, , name, password] = process.argv
if (!name || !password) {
  console.error('Usage: npm run set-password -- <name> <new password>')
  process.exit(1)
}
try {
  const u = setPassword(name, password)
  console.log(`✓ ${u.name} 密碼已更新`)
} catch (e: any) {
  console.error(`✗ ${e.message}`)
  process.exit(1)
}
