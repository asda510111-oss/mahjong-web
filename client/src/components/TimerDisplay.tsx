import { useEffect, useState } from 'react'

interface Props {
  thinkMs: number
  baseMs: number
  startAt: number
}

// 計時框內容：基礎 + 思考；思考=0 時「+」與思考秒數都消失
export default function TimerDisplay({ thinkMs, baseMs, startAt }: Props) {
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
  const thinkSec = Math.ceil(thinkRemain / 1000)
  const baseSec = Math.ceil(baseRemain / 1000)
  const thinkActive = thinkSec > 0
  return (
    <div className="timer-content">
      <span className="timer-base">{baseSec}</span>
      {thinkActive && <span className="timer-plus">+</span>}
      {thinkActive && <span className="timer-think">{thinkSec}</span>}
    </div>
  )
}
