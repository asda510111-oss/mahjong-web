// 音效系統：優先使用 src/assets/sounds/{action}.mp3，若缺檔自動 fallback 用 Web Audio 合成
//
// 要換成人聲音效：
//   把 chi.mp3 / peng.mp3 / gang.mp3 / hu.mp3 丟進 src/assets/sounds/
//   （檔名要一樣，副檔名支援 .mp3 .wav .ogg .m4a）
//
// 檔案在就自動使用；檔案缺就走合成音當 fallback。

export type MahjongSound = 'chi' | 'peng' | 'gang' | 'hu'

// Vite 編譯時靜態掃描 sounds 資料夾。同時支援：
//   1. 根目錄共用：sounds/chi.mp3 等（fallback）
//   2. 每位玩家專屬：sounds/{cat,panda,fox,bear}/chi.mp3
const rootSoundFiles = import.meta.glob(
  '../assets/sounds/*.{mp3,wav,ogg,m4a}',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>
const packSoundFiles = import.meta.glob(
  '../assets/sounds/{cat,panda,fox,bear}/{chi,peng,gang,hu}.{mp3,wav,ogg,m4a}',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>

// 根目錄 fallback 對應表（沒找到該 pack 音檔時使用）
const rootAudioCache: Partial<Record<MahjongSound, HTMLAudioElement>> = {}
for (const [path, url] of Object.entries(rootSoundFiles)) {
  const match = path.match(/\/(chi|peng|gang|hu)\.[^/]+$/i)
  if (!match) continue
  const action = match[1].toLowerCase() as MahjongSound
  const a = new Audio(url)
  a.preload = 'auto'
  rootAudioCache[action] = a
}

// 每包專屬對應表
const packAudioCache: Record<string, Partial<Record<MahjongSound, HTMLAudioElement>>> = {
  cat: {}, panda: {}, fox: {}, bear: {},
}
for (const [path, url] of Object.entries(packSoundFiles)) {
  const m = path.match(/sounds\/(cat|panda|fox|bear)\/(chi|peng|gang|hu)\.[^/]+$/i)
  if (!m) continue
  const [, pack, action] = m
  const a = new Audio(url)
  a.preload = 'auto'
  packAudioCache[pack][action.toLowerCase() as MahjongSound] = a
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
/**
 * 播放動作音效（吃/碰/槓/胡）
 * @param action 動作名稱
 * @param seat   執行該動作的玩家座位 0-3；省略則直接用根目錄共用音
 */
export function playSound(action: MahjongSound, seat?: number) {
  try {
    // 若有 seat → 先找對應 pack（cat/panda/fox/bear）
    if (seat !== undefined && seat !== null) {
      const pack = SEAT_PACK[(seat % 4 + 4) % 4]
      const a = packAudioCache[pack]?.[action]
      if (a) {
        a.currentTime = 0
        const p = a.play()
        if (p && typeof p.catch === 'function') p.catch(() => playRootOrSynth(action))
        return
      }
    }
    playRootOrSynth(action)
  } catch (e) {
    console.warn('[sound] play failed', e)
  }
}

function playRootOrSynth(action: MahjongSound) {
  const a = rootAudioCache[action]
  if (a) {
    a.currentTime = 0
    const p = a.play()
    if (p && typeof p.catch === 'function') p.catch(() => synthesize[action]())
    return
  }
  synthesize[action]()
}

// ===== 牌名語音（依座位/頭像對應四套：cat/panda/fox/bear） =====
const NUM_CHARS = ['一','二','三','四','五','六','七','八','九']
const ZI_CHARS  = ['東','南','西','北','中','發','白']
const FLOWER_CHARS = ['春','夏','秋','冬','梅','蘭','竹','菊']
// seat 0 / 1 / 2 / 3 對應的音檔資料夾（與 SEAT_AVATARS 順序一致）
const SEAT_PACK = ['cat', 'panda', 'fox', 'bear'] as const

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

// 掃描 cat/panda/fox/bear 子資料夾下所有 m1.mp3 / p2.wav 等檔案
const tileVoiceFiles = import.meta.glob(
  '../assets/sounds/{cat,panda,fox,bear}/*.{mp3,wav,ogg,m4a}',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>

// pack -> tileId -> Audio（預先建好）
const tileVoiceCache: Record<string, Record<string, HTMLAudioElement>> = {
  cat: {}, panda: {}, fox: {}, bear: {},
}
for (const [path, url] of Object.entries(tileVoiceFiles)) {
  const m = path.match(/sounds\/(cat|panda|fox|bear)\/([a-z]\d+)\.[^.]+$/i)
  if (!m) continue
  const [, pack, tileId] = m
  const a = new Audio(url)
  a.preload = 'auto'
  tileVoiceCache[pack][tileId.toLowerCase()] = a
}

function fallbackTTS(id: string) {
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

/**
 * 播報剛打出的那張牌
 * @param id    牌 id（如 'm5'、'z3'）
 * @param seat  打牌者座位 0-3，用來決定播哪套音檔；省略時走 TTS
 */
export function speakTile(id: string, seat?: number) {
  if (seat === undefined || seat === null) {
    fallbackTTS(id)
    return
  }
  const pack = SEAT_PACK[(seat % 4 + 4) % 4]
  const a = tileVoiceCache[pack]?.[id.toLowerCase()]
  if (a) {
    try {
      a.currentTime = 0
      const p = a.play()
      if (p && typeof p.catch === 'function') p.catch(() => fallbackTTS(id))
      return
    } catch {
      // ignore，落到 TTS
    }
  }
  fallbackTTS(id)
}

/** iOS Safari 首次互動時呼叫以解鎖音訊 */
export function unlockAudio() {
  const ac = getCtx()
  if (ac && ac.state === 'suspended') ac.resume().catch(() => {})
  // 同時解鎖 <audio> 元素（iOS 需要）：根目錄 + 4 個 pack + 每張牌音檔
  const allAudios: HTMLAudioElement[] = []
  for (const a of Object.values(rootAudioCache)) if (a) allAudios.push(a)
  for (const map of Object.values(packAudioCache)) {
    for (const a of Object.values(map)) if (a) allAudios.push(a)
  }
  for (const map of Object.values(tileVoiceCache)) {
    for (const a of Object.values(map)) if (a) allAudios.push(a)
  }
  for (const a of allAudios) {
    a.muted = true
    a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false }).catch(() => {})
  }
}
