import { setScore } from '../src/auth.js'

const [, , name, scoreStr] = process.argv
if (!name || !scoreStr) {
  console.error('Usage: npm run set-score -- <name> <score>')
  process.exit(1)
}
const score = Number(scoreStr)
if (!Number.isFinite(score)) {
  console.error('score must be a number')
  process.exit(1)
}
try {
  const u = setScore(name, Math.floor(score))
  console.log(`✓ ${u.name} 點數已設為 ${u.score}`)
} catch (e: any) {
  console.error(`✗ ${e.message}`)
  process.exit(1)
}
