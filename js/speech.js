// 読み上げ（端末の音声合成。インターネットがなくても動きます）
import { store } from './store.js'

let voice = null
let currentKey = null
let queue = []
let onEndCb = null

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function'

function pickVoice() {
  if (!canSpeak()) return null
  const vs = speechSynthesis.getVoices() || []
  const ja = vs.filter((v) => /^ja(-|_|$)/i.test(v.lang))
  // 自然に聞こえる声を優先する
  voice = ja.find((v) => /Kyoko|O-ren|Otoya|Hattori|Google 日本語|Nanami|Keita/i.test(v.name)) || ja.find((v) => v.localService) || ja[0] || null
  return voice
}
if (canSpeak()) {
  pickVoice()
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice)
}

// 画面の文（**強調**、コード、表）を、読み上げやすい文にする
export function speechText(src) {
  return String(src || '')
    .replace(/```[\s\S]*?```/g, '（コードは画面で確認してください）')
    .replace(/［図\d*］/g, '（図は画面で確認してください）')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^\s*\|?\s*:?-{2,}[-:| ]*$/gm, '')
    .replace(/\s*\|\s*/g, '、')
    .replace(/[（(]([A-Za-z0-9 .\-/]+)[)）]/g, '、$1、')
    .replace(/\n+/g, '。')
    .replace(/。{2,}/g, '。')
    .trim()
}

// 長い文は途中で止まる端末があるので、文ごとに分けて読む
function chunks(text) {
  const parts = String(text).split(/(?<=[。！？!?])/)
  const out = []
  let buf = ''
  for (const p of parts) {
    if ((buf + p).length > 160 && buf) { out.push(buf); buf = '' }
    buf += p
  }
  if (buf.trim()) out.push(buf)
  return out
}

export function isSpeaking(key) {
  return !!currentKey && (!key || currentKey === key)
}

export function stopSpeak() {
  if (!canSpeak()) return
  queue = []
  const cb = onEndCb
  onEndCb = null
  currentKey = null
  try { speechSynthesis.cancel() } catch (e) { /* 何もしない */ }
  if (cb) try { cb(true) } catch (e) { /* 何もしない */ }
}

// key：どのボタンの読み上げか（同じボタンをもう一度押すと止める）
export function speak(text, { key = 'any', rate = null, onend = null } = {}) {
  if (!canSpeak()) return false
  stopSpeak()
  if (!voice) pickVoice()
  queue = chunks(text)
  currentKey = key
  onEndCb = onend
  const r = rate || Number(store.get().profile.speechRate) || 1
  const next = () => {
    if (!queue.length || currentKey !== key) {
      if (currentKey === key) {
        currentKey = null
        const cb = onEndCb
        onEndCb = null
        if (cb) cb(false)
      }
      return
    }
    const u = new SpeechSynthesisUtterance(queue.shift())
    u.lang = 'ja-JP'
    if (voice) u.voice = voice
    u.rate = r
    u.onend = next
    u.onerror = () => { queue = []; next() }
    speechSynthesis.speak(u)
  }
  next()
  return true
}

// 読み終わるまで待つ（聞き流しの自動送りで使う）
export function speakAsync(text, opts = {}) {
  return new Promise((resolve) => {
    const ok = speak(text, { ...opts, onend: (stopped) => resolve(!stopped) })
    if (!ok) resolve(false)
  })
}
