// 音效系統：優先使用 src/assets/sounds/{action}.mp3，若缺檔自動 fallback 用 Web Audio 合成
//
// 要換成人聲音效：
//   把 chi.mp3 / peng.mp3 / gang.mp3 / hu.mp3 丟進 src/assets/sounds/
//   （檔名要一樣，副檔名支援 .mp3 .wav .ogg .m4a）
//
// 檔案在就自動使用；檔案缺就走合成音當 fallback。

export type MahjongSound = 'chi' | 'peng' | 'gang' | 'hu'

// Vite 編譯時靜態掃描 sounds 資料夾，取得所有音檔 URL
const soundFiles = import.meta.glob(
  '../assets/sounds/*.{mp3,wav,ogg,m4a}',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>

// 建立 "chi" -> "/assets/sounds/chi-xxx.mp3" 的對應表
const soundMap: Partial<Record<MahjongSound, string>> = {}
for (const [path, url] of Object.entries(soundFiles)) {
  const match = path.match(/\/(chi|peng|gang|hu)\.[^/]+$/i)
  if (match) soundMap[match[1].toLowerCase() as MahjongSound] = url
}

// 預先建立 Audio 元素（省去每次重建）
const audioCache: Partial<Record<MahjongSound, HTMLAudioElement>> = {}
for (const action of Object.keys(soundMap) as MahjongSound[]) {
  const url = soundMap[action]
  if (!url) continue
  const a = new Audio(url)
  a.preload = 'auto'
  audioCache[action] = a
}

// ===== Web Audio 合成備援 =====
let ctx: AudioContext | null = null
function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function tone(
  freq: number,
  startOffset: number,
  duration: number,
  options: { type?: OscillatorType; volume?: number; attack?: number } = {},
) {
  const ac = getCtx()
  if (!ac) return
  const { type = 'triangle', volume = 0.25, attack = 0.005 } = options
  const t0 = ac.currentTime + startOffset
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(volume, t0 + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(gain).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}
function chord(freqs: number[], startOffset: number, duration: number, volume = 0.18) {
  for (const f of freqs) tone(f, startOffset, duration, { volume, type: 'sine' })
}
const synthesize: Record<MahjongSound, () => void> = {
  chi() {
    tone(523.25, 0, 0.15, { type: 'triangle', volume: 0.22 })
    tone(659.25, 0.09, 0.2, { type: 'triangle', volume: 0.22 })
  },
  peng() {
    tone(392, 0, 0.1, { type: 'square', volume: 0.18 })
    tone(587.33, 0.1, 0.18, { type: 'square', volume: 0.2 })
  },
  gang() {
    tone(440, 0, 0.08, { type: 'square', volume: 0.2 })
    tone(554.37, 0.1, 0.08, { type: 'square', volume: 0.2 })
    tone(659.25, 0.2, 0.22, { type: 'square', volume: 0.22 })
  },
  hu() {
    chord([523.25, 659.25, 783.99], 0, 0.25, 0.15)
    tone(783.99, 0.25, 0.1, { type: 'triangle', volume: 0.22 })
    tone(880, 0.33, 0.1, { type: 'triangle', volume: 0.22 })
    tone(1046.5, 0.42, 0.35, { type: 'triangle', volume: 0.25 })
    chord([523.25, 659.25, 783.99, 1046.5], 0.45, 0.5, 0.14)
  },
}

// ===== 公開 API =====
export function playSound(action: MahjongSound) {
  try {
    const a = audioCache[action]
    if (a) {
      // 從頭播放（若前一次還沒結束也重新開始）
      a.currentTime = 0
      void a.play().catch(() => synthesize[action]())
      return
    }
    // 沒檔案 → 走合成音
    synthesize[action]()
  } catch (e) {
    console.warn('[sound] play failed', e)
  }
}

// ===== 牌名 TTS =====
const NUM_CHARS = ['一','二','三','四','五','六','七','八','九']
const ZI_CHARS  = ['東','南','西','北','中','發','白']
const FLOWER_CHARS = ['春','夏','秋','冬','梅','蘭','竹','菊']

function tileToText(id: string): string {
  if (!id || id.length < 2) return ''
  const suit = id[0]
  const rank = parseInt(id.slice(1), 10)
  if (Number.isNaN(rank)) return ''
  if (suit === 'm' && rank >= 1 && rank <= 9) return `${NUM_CHARS[rank-1]}萬`
  if (suit === 'p' && rank >= 1 && rank <= 9) return `${NUM_CHARS[rank-1]}筒`
  if (suit === 's' && rank >= 1 && rank <= 9) return `${NUM_CHARS[rank-1]}條`
  if (suit === 'z' && rank >= 1 && rank <= 7) return ZI_CHARS[rank-1]
  if (suit === 'f' && rank >= 1 && rank <= 8) return FLOWER_CHARS[rank-1]
  return ''
}

/** 播報剛打出的那張牌（中文 TTS）。多次呼叫會 cancel 前一次避免堆疊 */
export function speakTile(id: string) {
  if (typeof window === 'undefined') return
  if (!('speechSynthesis' in window)) return
  const text = tileToText(id)
  if (!text) return
  try {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'zh-TW'
    u.rate = 1.15
    u.volume = 1
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  } catch (e) {
    console.warn('[speak] fail', e)
  }
}

/** iOS Safari 首次互動時呼叫以解鎖音訊 */
export function unlockAudio() {
  const ac = getCtx()
  if (ac && ac.state === 'suspended') ac.resume().catch(() => {})
  // 同時解鎖 <audio> 元素（iOS 需要）
  for (const a of Object.values(audioCache)) {
    if (!a) continue
    a.muted = true
    a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false }).catch(() => {})
  }
}
