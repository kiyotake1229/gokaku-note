// Google スプレッドシートへの自動共有（相談相手が、いつでも最新の進み具合を見られる。バックアップにもなる）
// 送り先は、学習者が自分の Google アカウントで公開した Apps Script（tools/gas/Code.gs）だけ
import { store } from './store.js'
import { buildReport } from './report-build.js'
import { encode, decode, baseURL } from './share.js'

const GAS_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{10,}\/exec$/
// 手元での確認用（localhost のときだけ）
const DEV_RE = /^http:\/\/(localhost|127\.0\.0\.1):\d+\/macros\/s\/[A-Za-z0-9_-]+\/exec$/
const isDev = () => /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
export const validSyncURL = (u) => { u = String(u || '').trim(); return GAS_RE.test(u) || (isDev() && DEV_RE.test(u)) }

function randKey() {
  const a = new Uint8Array(24)
  crypto.getRandomValues(a)
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function request(url, opts = {}) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), opts.timeout || 30000)
  try {
    const res = await fetch(url, { ...opts, signal: ctl.signal, cache: 'no-store', redirect: 'follow' })
    let j = null
    try { j = await res.json() } catch (e) { /* JSON でない返事 */ }
    if (!j) { const e = new Error('bad-response'); e.code = res.status === 404 ? 'not-found' : 'bad-response'; throw e }
    if (!j.ok) { const e = new Error(j.error || 'error'); e.code = j.error || 'error'; throw e }
    return j
  } catch (e) {
    if (e.name === 'AbortError') { const x = new Error('timeout'); x.code = 'timeout'; throw x }
    if (!e.code) e.code = 'network'
    throw e
  } finally {
    clearTimeout(timer)
  }
}

async function post(cfg) {
  const body = { v: 1, w: cfg.w, r: cfg.r, report: buildReport(), backup: JSON.parse(store.exportJSON()) }
  // Content-Type を付けない（text/plain）ことで、事前の確認なしに送れる
  return request(cfg.url, { method: 'POST', body: JSON.stringify(body) })
}

export const ERR_TEXT = {
  key: '鍵が合いません。別の端末やアプリとつないだスクリプトかもしれません。スクリプトの resetKeys を実行してから、つなぎ直してください。',
  'not-setup': 'スクリプトの準備ができていません。',
  network: 'つながりませんでした。電波の状態と、URLが正しいかを確かめてください。',
  timeout: '時間内に返事がありませんでした。しばらくしてから、もう一度お試しください。',
  'not-found': 'URLの先が見つかりません。「ウェブアプリのURL」（/exec で終わるもの）を貼り付けてください。',
  'bad-response': '思った形の返事がありません。デプロイのとき「アクセスできるユーザー：全員」にしたか確かめてください。',
  busy: 'ほかの書き込み中でした。少し待ってから、もう一度お試しください。',
}
export const errText = (code) => ERR_TEXT[code] || '送れませんでした。しばらくしてから、もう一度お試しください。'

// 初めてつなぐ（同じURLにつなぎ直すときは、前の鍵を使う）
export async function connect(url) {
  url = String(url || '').trim()
  if (!validSyncURL(url)) { const e = new Error('url'); e.code = 'url'; throw e }
  const s = store.get()
  const old = s.sync && s.sync.url === url ? s.sync : null
  const cfg = { url, w: (old && old.w) || randKey(), r: (old && old.r) || randKey() }
  await post(cfg)
  s.sync = { ...cfg, at: Date.now(), okAt: Date.now(), err: '' }
  lastSig = signature()
  store.commit(true)
}
export function disconnect() {
  store.get().sync = null
  store.commit(true)
}

let running = false
export async function syncNow() {
  const s = store.get()
  const cfg = s.sync
  if (!cfg || !cfg.url || running) return null
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null
  running = true
  try {
    await post(cfg)
    s.sync = { ...s.sync, at: Date.now(), okAt: Date.now(), err: '' }
    lastSig = signature()
    store.commit(true)
    return true
  } catch (e) {
    s.sync = { ...s.sync, at: Date.now(), err: e.code || 'error' }
    store.commit(true)
    return false
  } finally {
    running = false
  }
}

// クラウドに保存したバックアップを取り出す
export async function fetchCloudBackup(cfg = store.get().sync) {
  if (!cfg || !validSyncURL(cfg.url)) throw new Error('no-sync')
  const j = await request(`${cfg.url}?what=backup&k=${encodeURIComponent(cfg.w)}`)
  const b = j.backup
  const data = b && b.data ? b.data : b
  if (!data || typeof data !== 'object' || !Array.isArray(data.logs)) { const e = new Error('empty'); e.code = 'empty'; throw e }
  return { data, at: j.at }
}

// 相談相手のページ（いつでも最新を表示する）のリンク
export async function liveReportURL() {
  const cfg = store.get().sync
  if (!cfg) return ''
  return `${baseURL()}report.html#live=${await encode({ u: cfg.url, r: cfg.r })}`
}
// 別の端末に引き継ぐためのコード（書き込みの鍵が入るので、自分だけで使う）
export async function transferCode() {
  const cfg = store.get().sync
  return cfg ? 'GN1.' + (await encode({ u: cfg.url, w: cfg.w, r: cfg.r })) : ''
}
export async function readTransferCode(code) {
  const m = String(code || '').trim().match(/^GN1\.([A-Za-z0-9_-]+)$/)
  if (!m) throw new Error('code')
  const o = await decode(m[1])
  if (!o || !validSyncURL(o.u) || typeof o.w !== 'string' || typeof o.r !== 'string') throw new Error('code')
  return { url: o.u, w: o.w, r: o.r }
}
export function adoptSync(cfg) {
  store.get().sync = { url: cfg.url, w: cfg.w, r: cfg.r, at: 0, okAt: 0, err: '' }
  store.commit(true)
}

// ---- 自動で送る：学習の記録が変わったら少し待って送る。アプリを開いたとき、前回から6時間以上なら送る ----
let lastSig = ''
let timer = null
function signature() {
  const s = store.get()
  return [s.sessions.length, s.logs.length, s.logs[0] && s.logs[0].id, s.logs.reduce((a, l) => a + (l.comment ? 1 : 0), 0), Object.keys(s.flags || {}).length, JSON.stringify(s.exams)].join('|')
}
export function startAutoSync() {
  lastSig = signature()
  const kick = (ms) => { clearTimeout(timer); timer = setTimeout(() => syncNow(), ms) }
  store.subscribe(() => {
    const s = store.get()
    if (!s.sync) return
    const sig = signature()
    if (sig !== lastSig) { lastSig = sig; kick(45000) }
  })
  const maybe = () => {
    const s = store.get()
    if (s.sync && (!s.sync.okAt || Date.now() - s.sync.okAt > 6 * 3600000)) kick(3000)
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') maybe() })
  window.addEventListener('online', maybe)
  maybe()
}
