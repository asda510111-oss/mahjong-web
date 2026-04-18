import { useEffect, useState } from 'react'

interface Props {
  thinkMs: number
  baseMs: number
  startAt: number
}

// 顯示兩個數字：思考秒（黃）/ 基礎秒（白）
// 思考用完才會開始扣基礎
export default function CountdownDisplay({ thinkMs, baseMs, startAt }: Props) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 200)
    return () => clearInterval(id)
  }, [])
  const elapsed = Math.max(0, Date.now() - startAt)
  const thinkRemain = Math.max(0, thinkMs - elapsed)
  const baseRemain = elapsed <= thinkMs
    ? baseMs
    : Math.max(0, baseMs - (elapsed - thinkMs))

  const thinkActive = thinkRemain > 0

  return (
    <div className="turn-timer-stack" aria-label="倒數計時">
      <div className={`turn-timer think ${thinkActive ? '' : 'dim'}`}>
        {Math.ceil(thinkRemain / 1000)}
      </div>
      <div className={`turn-timer base ${thinkActive ? 'dim' : ''}`}>
        {Math.ceil(baseRemain / 1000)}
      </div>
    </div>
  )
}
