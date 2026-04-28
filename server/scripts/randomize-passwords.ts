// CLI: npm run randomize-passwords
// 為所有帳號重新產生 6 碼隨機數字密碼，輸出對照表
import { randomInt } from 'node:crypto'
import { listAllUsers, setPassword } from '../src/auth.js'

function genNumericPwd(len = 6): string {
  let s = ''
  for (let i = 0; i < len; i++) s += randomInt(0, 10).toString()
  return s
}

const users = listAllUsers()
if (users.length === 0) {
  console.log('（無帳號）')
  process.exit(0)
}

console.log('==== 新密碼對照（請另外保存，本表不再保留） ====')
console.log('帳號\t密碼')
console.log('--------------------')
for (const u of users) {
  const pwd = genNumericPwd(6)
  setPassword(u.name, pwd)
  console.log(`${u.name}\t${pwd}`)
}
console.log('--------------------')
console.log(`✓ 已更新 ${users.length} 個帳號`)
