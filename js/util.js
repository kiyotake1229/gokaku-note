// 汎用ヘルパー

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c])

// 日付は端末のローカル時刻で "YYYY-MM-DD" として扱う
export function ymd(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export const today = () => ymd(new Date())
export function parseYmd(s) {
  const [y, m, d] = String(s).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
export function addDays(s, n) {
  const d = parseYmd(s)
  d.setDate(d.getDate() + n)
  return ymd(d)
}
export function daysBetween(a, b) {
  return Math.round((parseYmd(b) - parseYmd(a)) / 86400000)
}
const WD = ['日', '月', '火', '水', '木', '金', '土']
export function fmtDate(s, withWeekday = true) {
  if (!s) return ''
  const d = parseYmd(s)
  return `${d.getMonth() + 1}月${d.getDate()}日` + (withWeekday ? `（${WD[d.getDay()]}）` : '')
}
export function fmtDateFull(s) {
  if (!s) return ''
  const d = parseYmd(s)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}
export function fmtMin(min) {
  min = Math.round(min || 0)
  if (min < 60) return `${min}分`
  const h = Math.floor(min / 60), m = min % 60
  return m ? `${h}時間${m}分` : `${h}時間`
}
export function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec))
  const m = Math.floor(sec / 60), s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

export function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
export function sample(arr, n) {
  return shuffle(arr).slice(0, n)
}
export function groupBy(arr, fn) {
  const m = {}
  for (const x of arr) (m[fn(x)] ||= []).push(x)
  return m
}
export function debounce(fn, ms = 250) {
  let t
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) }
}
export function vibrate(p) {
  try { if (navigator.vibrate) navigator.vibrate(p) } catch (e) { /* 対応していない端末は無視 */ }
}

function inline(t) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
}
// 「a | b | c」の行が2行以上続くところは、表として表示する
function textWithTables(src) {
  const lines = String(src).replace(/^\n+|\n+$/g, '').split('\n')
  const isRow = (l) => (l.match(/\|/g) || []).length >= 1 && !/^\s*\|?\s*[-:| ]+\s*$/.test(l)
  const isSep = (l) => /^\s*\|?\s*:?-{2,}[-:| ]*$/.test(l)
  const cells = (l) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim())
  let html = '', buf = []
  const flushText = (arr) => arr.map(inline).join('<br>')
  let i = 0
  while (i < lines.length) {
    if (isRow(lines[i])) {
      let j = i
      const rows = []
      while (j < lines.length && (isRow(lines[j]) || isSep(lines[j]))) { if (!isSep(lines[j])) rows.push(cells(lines[j])); j++ }
      if (rows.length >= 2) {
        if (buf.length) { html += flushText(buf) + '<br>'; buf = [] }
        const [head, ...body] = rows
        html += `<div class="q-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
        i = j
        continue
      }
    }
    buf.push(lines[i])
    i++
  }
  if (buf.length) html += flushText(buf)
  return html.replace(/(<br>)+(<div class="q-table">)/g, '$2').replace(/(<\/div>)(<br>)+/g, '$1')
}

// 問題文・解説の整形：```コード```、改行、**強調**、表
export function richText(src) {
  const parts = String(src ?? '').split(/```(?:[a-zA-Z]*)\n?([\s\S]*?)```/g)
  let out = ''
  parts.forEach((p, i) => {
    if (i % 2 === 1) {
      const ls = p.split('\n').filter((l) => l.trim())
      // 「|」で区切った行だけでできた枠は、表として表示する
      if (ls.length >= 2 && ls.every((l) => l.includes('|'))) out += textWithTables(p)
      else out += `<pre><code>${esc(p.replace(/\n$/, ''))}</code></pre>`
    } else {
      out += textWithTables(p)
    }
  })
  return out
}

export function download(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(url); a.remove() }, 500)
}

export function toCSV(rows) {
  const cell = (v) => {
    const s = String(v ?? '')
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n')
}
export function toTSV(rows) {
  return rows.map((r) => r.map((v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n')
}
