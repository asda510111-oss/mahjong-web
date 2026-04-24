import { resetScore } from '../src/auth.js'

const [, , name] = process.argv
if (!name) {
  console.error('Usage: npm run reset-score -- <name>')
  process.exit(1)
}
try {
  const u = resetScore(name)
  console.log(`✓ ${u.name} 點數已重置為 ${u.score}`)
} catch (e: any) {
  console.error(`✗ ${e.message}`)
  process.exit(1)
}
