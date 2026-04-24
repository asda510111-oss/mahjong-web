import { renameUser } from '../src/auth.js'

const [, , oldName, newName] = process.argv
if (!oldName || !newName) {
  console.error('Usage: npm run rename-user -- <old name> <new name>')
  process.exit(1)
}
try {
  const u = renameUser(oldName, newName)
  console.log(`✓ ${oldName} → ${u.name}`)
} catch (e: any) {
  console.error(`✗ ${e.message}`)
  process.exit(1)
}
