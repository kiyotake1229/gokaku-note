// 教科書（分野ごとの短いレッスン）：読み込み、読んだ記録、本文の表示
import { store } from './store.js'
import { lessons as loadLessons, cert as getCert } from './data.js'
import { esc } from './util.js'

// 全部のレッスンを1列に並べる（前後の回へ移るため）
export function flatLessons(book) {
  const out = []
  for (const ch of (book && book.chapters) || []) for (const l of ch.lessons || []) out.push({ ...l, cat: ch.cat })
  return out
}
export const isRead = (id) => !!(store.get().lessons || {})[id]
export function markRead(id, on = true) {
  const s = store.get()
  s.lessons = s.lessons || {}
  if (on) s.lessons[id] = { at: Date.now() }
  else delete s.lessons[id]
  store.commit(true)
}
// 資格ごとの読んだ回の数（教科書の総数は certs.json の counts.lessons）
export function lessonStats(certId) {
  const c = getCert(certId)
  const total = (c && c.counts && c.counts.lessons) || 0
  const prefix = certId + '-'
  const read = Object.keys(store.get().lessons || {}).filter((id) => id.startsWith(prefix)).length
  return { read: Math.min(read, total), total }
}
// 次に読む回（まだ読んでいない最初の回。分野をしぼることもできる）
export function nextLesson(book, cat = null) {
  const all = flatLessons(book).filter((l) => !cat || l.cat === cat)
  return all.find((l) => !isRead(l.id)) || null
}
export async function getBook(certId) {
  try { return await loadLessons(certId) } catch (e) { return null }
}

// ---- 本文の表示（「## 見出し」「- 」「1. 」「| 表 |」「> 」「例：」「**強調**」） ----
const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
export function lessonHTML(src) {
  const blocks = String(src || '').replace(/\r/g, '').split(/\n{2,}/)
  let html = ''
  for (const raw of blocks) {
    const b = raw.replace(/^\n+|\n+$/g, '')
    if (!b.trim()) continue
    const lines = b.split('\n').filter((l) => !/^\s*\|?\s*:?-{2,}[-:| ]*$/.test(l))
    if (/^##\s+/.test(lines[0])) {
      html += `<h3>${inline(lines[0].replace(/^##\s+/, ''))}</h3>`
      const rest = lines.slice(1).join('\n')
      if (rest.trim()) html += lessonHTML(rest)
      continue
    }
    if (lines.every((l) => /^\s*[-・]\s+/.test(l))) {
      html += `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-・]\s+/, ''))}</li>`).join('')}</ul>`
      continue
    }
    if (lines.every((l) => /^\s*\d+[.．]\s*/.test(l))) {
      html += `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.．]\s*/, ''))}</li>`).join('')}</ol>`
      continue
    }
    if (lines.length >= 2 && lines.every((l) => /^\s*\|.*\|\s*$/.test(l))) {
      const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim())
      const [head, ...rows] = lines.map(cells)
      html += `<div class="q-table lesson-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      continue
    }
    if (lines.every((l) => /^\s*>\s?/.test(l))) {
      html += `<div class="ls-point"><span class="ls-tag">ポイント</span>${lines.map((l) => inline(l.replace(/^\s*>\s?/, ''))).join('<br>')}</div>`
      continue
    }
    if (/^例[：:]/.test(lines[0])) {
      html += `<div class="ls-example"><span class="ls-tag">例</span>${lines.map((l, i) => inline(i === 0 ? l.replace(/^例[：:]\s*/, '') : l)).join('<br>')}</div>`
      continue
    }
    // まざっているときは、1行ずつ見る
    if (lines.length > 1 && lines.some((l) => /^(##\s|\s*[-・]\s|\s*\d+[.．]|\s*>|\s*\|)/.test(l))) {
      html += lessonHTML(lines.join('\n\n'))
      continue
    }
    html += `<p>${lines.map(inline).join('<br>')}</p>`
  }
  return html
}
// 読み上げ用の文
export function lessonSpeech(l) {
  const body = String(l.body || '')
    .replace(/^##\s+/gm, '')
    .replace(/^\s*>\s?/gm, 'ポイント。')
    .replace(/^例[：:]\s*/gm, 'たとえば、')
    .replace(/^\s*[-・]\s+/gm, '')
    .replace(/^\s*\|?\s*:?-{2,}[-:| ]*$/gm, '')
  return [l.title, ...(l.goals || []), body].join('。\n')
}
