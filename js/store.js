// 学習データの保存（端末の localStorage のみ。サーバーには送りません）
import { today, uid } from './util.js'

const KEY = 'gokaku.v1'

function blank() {
  return {
    version: 1,
    createdAt: today(),
    profile: {
      name: '',
      mentor: '',
      dailyGoal: 30,
      theme: 'auto',
      quizSize: 10,
      shuffle: true,
      vibrate: true,
      onboarded: false,
      focusCert: '',
      fs: 'm',          // 文字の大きさ s / m / l / xl
      speechRate: 1,    // 読み上げの速さ
      studyTime: '20:00', // カレンダーに入れる勉強の時刻
      newScope: {},     // 2027年からの新しい範囲を出すか { [certId]: 'auto' | 'on' | 'off' }
    },
    q: {},          // 問題ごとの記録 { box, due, seen, ok, ng, last, lastOk, reason, unsure, mark }
    t: {},          // 用語ごとの記録 { box, due, seen, last, grade }
    sessions: [],   // 問題の結果（練習・模試）
    logs: [],       // 学習ログ
    exams: {},      // 受験の予定と結果 { applied, date, result, score, expiry, proof, memo }
    checks: {},     // 当日チェックリストなど { [certId]: { [key]: true } }
    active: null,   // 途中のクイズ
    timer: null,    // 動作中のタイマー { start, minutes, cert, pausedAt, pausedTotal }
    shared: null,   // 最後に進み具合を送った日時 { at }
    mentorNotes: [], // 相談相手からのひとこと [{ t, from, msg, read }]
    imported: [],   // 受け取った返信（二重に入れないため）
    flags: {},      // 「この問題おかしい？」の報告 { [qid]: { t, kind, note, cert, stem } }
    backup: null,   // 最後にバックアップした日時 { at, how }
    backupSnooze: 0, // バックアップのお知らせを出さない期限（ミリ秒）
    drills: {},     // 計算ドリルの成績 { [type]: { n, ok, last } }
    sync: null,     // Google スプレッドシートへの自動共有 { url, w, r, at, okAt, err }
  }
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
// 壊れたデータや古い形式でも動くように、項目ごとに形を確かめる
export function sanitize(s) {
  const b = blank()
  if (!isObj(s)) return b
  return {
    ...b, ...s,
    profile: { ...b.profile, ...(isObj(s.profile) ? s.profile : {}), newScope: isObj(s.profile && s.profile.newScope) ? s.profile.newScope : {} },
    q: isObj(s.q) ? s.q : {},
    t: isObj(s.t) ? s.t : {},
    sessions: Array.isArray(s.sessions) ? s.sessions.filter(isObj) : [],
    logs: Array.isArray(s.logs) ? s.logs.filter(isObj) : [],
    exams: isObj(s.exams) ? s.exams : {},
    checks: isObj(s.checks) ? s.checks : {},
    active: isObj(s.active) && Array.isArray(s.active.ids) ? s.active : null,
    timer: isObj(s.timer) && s.timer.start ? s.timer : null,
    shared: isObj(s.shared) ? s.shared : null,
    mentorNotes: Array.isArray(s.mentorNotes) ? s.mentorNotes.filter(isObj) : [],
    imported: Array.isArray(s.imported) ? s.imported : [],
    flags: isObj(s.flags) ? s.flags : {},
    backup: isObj(s.backup) ? s.backup : null,
    backupSnooze: Number(s.backupSnooze) || 0,
    drills: isObj(s.drills) ? s.drills : {},
    sync: isObj(s.sync) && typeof s.sync.url === 'string' ? s.sync : null,
  }
}

let state = load()
const listeners = new Set()
let saveTimer = null
let storageOk = true

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return blank()
    return sanitize(JSON.parse(raw))
  } catch (e) {
    return blank()
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    storageOk = true
  } catch (e) {
    storageOk = false
  }
}

export const store = {
  get: () => state,
  get storageOk() { return storageOk },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
  // 変更して保存（呼び出し側で state を直接いじったあとに呼ぶ）
  commit(immediate = false) {
    clearTimeout(saveTimer)
    if (immediate) persist()
    else saveTimer = setTimeout(persist, 120)
    listeners.forEach((fn) => { try { fn(state) } catch (e) { console.error(e) } })
  },
  flush() { clearTimeout(saveTimer); persist() },
  replace(next) {
    state = sanitize(next)
    persist()
    listeners.forEach((fn) => fn(state))
  },
  reset() { state = blank(); state.profile.onboarded = true; persist(); listeners.forEach((fn) => fn(state)) },
  exportJSON() { return JSON.stringify({ app: 'gokaku-note', exportedAt: new Date().toISOString(), data: state }, null, 1) },

  // ---- 学習ログ ----
  addLog(entry) {
    const e = { id: uid(), date: today(), cert: '', what: '', minutes: 30, learned: '', ask: '', comment: '', ...entry }
    state.logs.unshift(e)
    state.logs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    this.commit(true)
    return e
  },
  updateLog(id, patch) {
    const e = state.logs.find((x) => x.id === id)
    if (e) Object.assign(e, patch)
    state.logs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    this.commit(true)
  },
  removeLog(id) { state.logs = state.logs.filter((x) => x.id !== id); this.commit(true) },

  // ---- 問題の結果 ----
  addSession(s) {
    state.sessions.unshift({ id: uid(), date: today(), ts: Date.now(), ...s })
    this.commit(true)
  },
  removeSession(id) { state.sessions = state.sessions.filter((x) => x.id !== id); this.commit(true) },

  // ---- 受験 ----
  setExam(cert, patch) {
    state.exams[cert] = { ...(state.exams[cert] || {}), ...patch }
    this.commit(true)
  },
  toggleCheck(cert, key) {
    const c = (state.checks[cert] ||= {})
    if (c[key]) delete c[key]
    else c[key] = true
    this.commit()
  },
  setProfile(patch) { Object.assign(state.profile, patch); this.commit(true) },
}

// ページを閉じるときに確実に保存
window.addEventListener('pagehide', () => store.flush())
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') store.flush() })
