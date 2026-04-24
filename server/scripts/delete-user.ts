import { deleteUser } from '../src/auth.js'

const [, , name] = process.argv
if (!name) {
  console.error('Usage: npm run delete-user -- <name>')
  process.exit(1)
}
try {
  deleteUser(name)
  console.log(`✓ 已刪除帳號 ${name}`)
} catch (e: any) {
  console.error(`✗ ${e.message}`)
  process.exit(1)
}
