// 進み具合レポートと返信を、リンク（# より後ろ）に入れてやりとりする
// # より後ろはサーバーに送られないので、GitHub には記録が残らない
// （このファイルは記録の保存場所を読み書きしない。レポートのページからも使うため）

// ---- 圧縮して URL に入れられる文字にする ----
function b64url(bytes) {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function unb64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream))
  return new Uint8Array(await res.arrayBuffer())
}
export async function encode(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj))
  if (typeof CompressionStream === 'function') {
    try { return 'z' + b64url(await pipe(raw, new CompressionStream('deflate-raw'))) } catch (e) { /* 圧縮できない環境 */ }
  }
  return 'j' + b64url(raw)
}
export async function decode(str) {
  const kind = str[0]
  if (kind === 'z' && typeof DecompressionStream !== 'function') {
    const e = new Error('unsupported')
    e.code = 'unsupported'
    throw e
  }
  const bytes = unb64url(str.slice(1))
  const raw = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes
  return JSON.parse(new TextDecoder().decode(raw))
}

// アプリの置き場所（report.html と index.html は同じフォルダ）
export const baseURL = () => new URL('.', location.href).href

// ---- 岩崎さん → 清武さん：返信 ----
export async function replyURL(reply) {
  return `${baseURL()}#/import?r=${await encode({ v: 1, t: Date.now(), ...reply })}`
}

// 共有メニュー（なければコピー）
export async function shareOrCopy({ title, text, url }) {
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return 'shared' } catch (e) { if (e && e.name === 'AbortError') return 'cancel' }
  }
  try { await navigator.clipboard.writeText(text ? `${text}\n${url}` : url); return 'copied' } catch (e) { return 'fail' }
}


// ---- 受け取ったデータの形を整える（リンクは誰でも作れるので、必ず通す） ----
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d }
const str = (v, max = 500) => String(v == null ? '' : v).slice(0, max)
const ID = /^[A-Za-z0-9_-]{1,40}$/
const DAY = /^(\d{4}-)?\d{2}-\d{2}$/
const day = (v) => (DAY.test(String(v)) ? String(v) : '')
const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : [])
const STATUSES = ['todo', 'doing', 'booked', 'passed']

export function normalizeReport(d) {
  if (!d || d.v !== 1) throw new Error('形式が違います')
  return {
    v: 1, t: num(d.t), n: str(d.n, 40), m: str(d.m, 40), g: Math.max(1, num(d.g, 30)), sk: num(d.sk), tm: num(d.tm),
    days: arr(d.days, 60).filter((x) => Array.isArray(x) && /^\d{2}-\d{2}$/.test(String(x[0]))).map((x) => [String(x[0]), num(x[1]), num(x[2]), num(x[3])]),
    certs: arr(d.certs, 20).filter((c) => c && ID.test(String(c.id))).map((c) => ({
      id: String(c.id), st: STATUSES.includes(c.st) ? c.st : 'todo', ma: num(c.ma), se: num(c.se), to: num(c.to),
      rr: c.rr == null ? null : num(c.rr), mi: num(c.mi), rd: c.rd ? 1 : 0, du: num(c.du), wr: num(c.wr), nt: num(c.nt),
      mk: c.mk ? { d: day(c.mk.d), c: num(c.mk.c), t: num(c.mk.t), p: c.mk.p ? 1 : 0 } : null,
      wk: arr(c.wk, 3).filter((w) => Array.isArray(w) && ID.test(String(w[0]))).map((w) => [String(w[0]), num(w[1])]),
      ex: c.ex ? { a: day(c.ex.a), d: day(c.ex.d), r: ['合格', '不合格'].includes(c.ex.r) ? c.ex.r : '', s: str(c.ex.s, 30), e: day(c.ex.e) } : null,
    })),
    asks: arr(d.asks, 30).filter((a) => a && ID.test(String(a.id))).map((a) => ({ id: String(a.id), d: day(a.d), c: str(a.c, 20), q: str(a.q, 300), w: str(a.w, 100) })),
    logs: arr(d.logs, 30).map((l) => ({ d: day(l && l.d), c: str(l && l.c, 20), mi: num(l && l.mi), w: str(l && l.w, 100), l: str(l && l.l, 120) })),
    recent: arr(d.recent, 20).map((r) => ({ d: day(r && r.d), c: str(r && r.c, 20), m: str(r && r.m, 20), t: num(r && r.t), k: num(r && r.k) })),
  }
}

export function normalizeReply(d) {
  if (!d || d.v !== 1 || typeof d.c !== 'object' || !d.c) throw new Error('形式が違います')
  const c = {}
  for (const [k, v] of Object.entries(d.c).slice(0, 50)) if (ID.test(k) && typeof v === 'string' && v.trim()) c[k] = v.trim().slice(0, 1000)
  return { v: 1, t: num(d.t), from: str(d.from, 40), msg: str(d.msg, 1000).trim(), c, rt: num(d.rt) }
}
