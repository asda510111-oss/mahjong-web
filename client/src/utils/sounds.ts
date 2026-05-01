// 音效系統（Web Audio API 版）
//
// 為什麼用 Web Audio：iOS Safari 對 HTMLAudio 的同時存在數量有限制（約 32-36 個），
// 一旦音檔太多，第一次 unlock 後仍有部分元素無法 play。Web Audio 只需要一個
// AudioContext，所有 buffer 都從同一個 context 播放，iOS 上行為穩定。
//
// 音檔規則：
//   chi/peng/gang/hu      → 動作音效（共用 fallback）
//   {cat,panda,fox,bear}/chi.mp3 等         → 各家專屬動作音
//   {cat,panda,fox,bear}/{m1..m9, p1..p9, s1..s9, z1..z7}.mp3 → 各家牌名語音
//   花牌（f1-f8）           → 不發聲（補花動作不需要語音）
//   缺檔                  → 動作走合成音、牌名走瀏覽器 TTS

export type MahjongSound = 'chi' | 'peng' | 'gang' | 'hu'

const SEAT_PACK = ['cat', 'panda', 'fox', 'bear'] as const
type Pack = typeof SEAT_PACK[number]

// ===== 音檔 URL 表（編譯時靜態解析） =====
const rootSoundFiles = import.meta.glob(
  '../assets/sounds/*.{mp3,wav,ogg,m4a}',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>
const packSoundFiles = import.meta.glob(
  '../assets/sounds/{cat,panda,fox,bear}/*.{mp3,wav,ogg,m4a}',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>

// 根目錄動作音（沒指定 seat 或 pack 缺檔時的 fallback）
const rootActionUrls: Partial<Record<MahjongSound, string>> = {}
for (const [path, url] of Object.entries(rootSoundFiles)) {
  const m = path.match(/\/(chi|peng|gang|hu)\.[^/]+$/i)
  if (m) rootActionUrls[m[1].toLowerCase() as MahjongSound] = url
}

// 每包動作音：cat/chi.mp3 等
const packActionUrls: Record<Pack, Partial<Record<MahjongSound, string>>> = {
  cat: {}, panda: {}, fox: {}, bear: {},
}
// 每包牌名音：cat/m5.mp3 等
const tileVoiceUrls: Record<Pack, Record<string, string>> = {
  cat: {}, panda: {}, fox: {}, bear: {},
}
for (const [path, url] of Object.entries(packSoundFiles)) {
  const m = path.match(/sounds\/(cat|panda|fox|bear)\/([a-z][a-z0-9]+)\.[^/]+$/i)
  if (!m) continue
  const pack = m[1] as Pack
  const name = m[2].toLowerCase()
  if (name === 'chi' || name === 'peng' || name === 'gang' || name === 'hu') {
    packActionUrls[pack][name as MahjongSound] = url
  } else {
    tileVoiceUrls[pack][name] = url
  }
}

// ===== AudioContext（單一實例） =====
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

// ===== Buffer 快取（fetch + decodeAudioData 結果） =====
const bufferCache = new Map<string, AudioBuffer | 'loading' | 'failed'>()

async function loadBuffer(url: string): Promise<AudioBuffer | null> {
  const cached = bufferCache.get(url)
  if (cached instanceof AudioBuffer) return cached
  if (cached === 'failed') return null
  if (cached === 'loading') return null // 還沒好就先放棄，下次再試
  bufferCache.set(url, 'loading')
  const ac = getCtx()
  if (!ac) { bufferCache.set(url, 'failed'); return null }
  try {
    const res = await fetch(url)
    const ab = await res.arrayBuffer()
    const buf: AudioBuffer = await new Promise((resolve, reject) => {
      // 用 callback 形式相容 Safari 舊版
      ac.decodeAudioData(ab, resolve, reject)
    })
    bufferCache.set(url, buf)
    return buf
  } catch (e) {
    console.warn('[sound] decode fail', url, e)
    bufferCache.set(url, 'failed')
    return null
  }
}

// 預載所有已知音檔（背景執行，不阻塞）
function preloadAll() {
  const urls = new Set<string>()
  for (const u of Object.values(rootActionUrls)) if (u) urls.add(u)
  for (const map of Object.values(packActionUrls)) for (const u of Object.values(map)) if (u) urls.add(u)
  for (const map of Object.values(tileVoiceUrls)) for (const u of Object.values(map)) urls.add(u)
  for (const u of urls) loadBuffer(u).catch(() => {})
}

// ===== 播放 buffer（每次 new 一個 BufferSource） =====
function playBuffer(buf: AudioBuffer) {
  const ac = getCtx()
  if (!ac) return
  try {
    const src = ac.createBufferSource()
    src.buffer = buf
    src.connect(ac.destination)
    src.start(0)
  } catch (e) {
    console.warn('[sound] playBuffer fail', e)
  }
}

async function tryPlayUrl(url: string | undefined): Promise<boolean> {
  if (!url) return false
  const buf = await loadBuffer(url)
  if (!buf) return false
  playBuffer(buf)
  return true
}

// ===== 合成音備援（buffer 不存在或還沒載好時） =====
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

// ===== 牌名 TTS fallback =====
const NUM_CHARS = ['一','二','三','四','五','六','七','八','九']
const ZI_CHARS  = ['東','南','西','北','中','發','白']

function tileToText(id: string): string {
  if (!id || id.length < 2) return ''
  const suit = id[0]
  const rank = parseInt(id.slice(1), 10)
  if (Number.isNaN(rank)) return ''
  if (suit === 'm' && rank >= 1 && rank <= 9) return `${NUM_CHARS[rank-1]}萬`
  if (suit === 'p' && rank >= 1 && rank <= 9) return `${NUM_CHARS[rank-1]}筒`
  if (suit === 's' && rank >= 1 && rank <= 9) return `${NUM_CHARS[rank-1]}條`
  if (suit === 'z' && rank >= 1 && rank <= 7) return ZI_CHARS[rank-1]
  return ''
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

// ===== 公開 API =====
/**
 * 播放動作音效（吃/碰/槓/胡）
 * @param action 動作名稱
 * @param seat   執行該動作的玩家座位 0-3；省略則只用根目錄共用音
 */
export function playSound(action: MahjongSound, seat?: number) {
  ;(async () => {
    try {
      // 1. 找對應 pack 的音檔
      if (seat !== undefined && seat !== null) {
        const pack = SEAT_PACK[(seat % 4 + 4) % 4]
        if (await tryPlayUrl(packActionUrls[pack][action])) return
      }
      // 2. 根目錄共用音檔
      if (await tryPlayUrl(rootActionUrls[action])) return
      // 3. 合成音 fallback
      synthesize[action]()
    } catch (e) {
      console.warn('[sound] play failed', e)
    }
  })()
}

/**
 * 播報剛打出的那張牌
 * @param id    牌 id（如 'm5'、'z3'）
 * @param seat  打牌者座位 0-3，用來決定播哪套音檔；省略時走 TTS
 */
export function speakTile(id: string, seat?: number) {
  // 花牌（f1-f8）屬補花動作，不發聲
  if (id && id[0] === 'f') return
  ;(async () => {
    if (seat !== undefined && seat !== null) {
      const pack = SEAT_PACK[(seat % 4 + 4) % 4]
      if (await tryPlayUrl(tileVoiceUrls[pack][id.toLowerCase()])) return
    }
    fallbackTTS(id)
  })()
}

/**
 * iOS Safari 首次互動時呼叫以解鎖音訊
 * - 在 user gesture 內 resume AudioContext
 * - 觸發一個 silent buffer 確保 iOS 永久解鎖
 * - 開始背景預載所有音檔（讓首次播放也能即時）
 */
export function unlockAudio() {
  const ac = getCtx()
  if (!ac) return
  if (ac.state === 'suspended') ac.resume().catch(() => {})
  // silent buffer 強制觸發解鎖
  try {
    const src = ac.createBufferSource()
    src.buffer = ac.createBuffer(1, 1, 22050)
    src.connect(ac.destination)
    src.start(0)
  } catch {
    // ignore
  }
  // 預載所有音檔（異步、不阻塞）
  preloadAll()
}
