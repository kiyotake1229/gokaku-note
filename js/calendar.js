// カレンダーに登録する：毎日の勉強の時間、受験日、申込みの締切
// .ics ファイル（iPhone・Mac・Outlook など）と、Google カレンダーの登録リンクを作る（サーバーは使わない）
import { store } from './store.js'
import { orderedCerts } from './data.js'
import { today, addDays, parseYmd } from './util.js'

const APP_URL = () => new URL('.', location.href).href
const ymdc = (d) => String(d).replace(/-/g, '')
const two = (n) => String(n).padStart(2, '0')

// ---- 予定の一覧 ----
export function calendarItems({ time = '20:00', minutes = 30, until = null, study = true, exams = true, deadlines = true } = {}) {
  const s = store.get()
  const d = today()
  const items = []
  const upcoming = orderedCerts().map((c) => ({ c, e: s.exams[c.id] || {} })).filter(({ e }) => e.date && e.date >= d && e.result !== '合格')
  const last = upcoming.map((x) => x.e.date).sort().pop()
  const end = until || last || addDays(d, 90)
  if (study) {
    const [hh, mm] = String(time || '20:00').split(':').map(Number)
    const start = addDays(d, 1)
    const st = `${ymdc(start)}T${two(hh || 0)}${two(mm || 0)}00`
    const endMin = (hh || 0) * 60 + (mm || 0) + minutes
    const et = `${ymdc(addDays(start, Math.floor(endMin / 1440)))}T${two(Math.floor((endMin % 1440) / 60))}${two(endMin % 60)}00`
    items.push({
      key: 'study', uid: `study-${ymdc(start)}`, title: `合格ノートで勉強（${minutes}分）`,
      start: st, end: et, allDay: false, until: end,
      desc: `今日の復習と、おまかせ学習をしましょう。\n${APP_URL()}`, alarms: ['-PT0M'],
    })
  }
  if (exams) {
    for (const { c, e } of upcoming) {
      items.push({
        key: 'exam-' + c.id, uid: `exam-${c.id}-${ymdc(e.date)}`, title: `受験日：${c.name}`,
        start: ymdc(e.date), end: ymdc(addDays(e.date, 1)), allDay: true,
        desc: `持ち物と当日のチェックリストは、アプリの「${c.short} → 受験」にあります。\n${APP_URL()}#/cert/${c.id}/exam`,
        alarms: ['-P6DT15H', '-PT15H'], // 1週間前と前日の9時
      })
    }
  }
  if (deadlines) {
    for (const c of orderedCerts()) {
      const ex = s.exams[c.id] || {}
      if (ex.result === '合格') continue
      for (const dl of c.deadlines || []) {
        if (dl.date < d) continue
        items.push({
          key: `dl-${c.id}-${dl.date}`, uid: `deadline-${c.id}-${ymdc(dl.date)}`, title: `${c.short}：${dl.label}`,
          start: ymdc(dl.date), end: ymdc(addDays(dl.date, 1)), allDay: true,
          desc: `公式ページで日程を確かめてください：${c.official}`, alarms: ['-P6DT15H', '-PT15H'],
        })
      }
    }
  }
  return { items, end }
}

// ---- .ics ----
const escText = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
// 1行は75バイトまで（日本語は1文字3バイト）。超えたら折り返す
function fold(line) {
  const enc = new TextEncoder()
  const out = []
  let cur = '', bytes = 0, limit = 75
  for (const ch of line) {
    const b = enc.encode(ch).length
    if (bytes + b > limit) { out.push(cur); cur = ' '; bytes = 1; limit = 75 }
    cur += ch
    bytes += b
  }
  out.push(cur)
  return out.join('\r\n')
}
function utcStamp(d = new Date()) {
  return `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}T${two(d.getUTCHours())}${two(d.getUTCMinutes())}${two(d.getUTCSeconds())}Z`
}
// 日本時間のその日の終わり（23:59:59）を UTC で
const untilUTC = (ymd) => `${ymdc(ymd)}T145959Z`

export function buildICS(items) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//gokaku-note//study app//JA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:合格ノート', 'X-WR-TIMEZONE:Asia/Tokyo',
    'BEGIN:VTIMEZONE', 'TZID:Asia/Tokyo', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0900', 'TZOFFSETTO:+0900', 'TZNAME:JST', 'END:STANDARD', 'END:VTIMEZONE']
  const stamp = utcStamp()
  for (const it of items) {
    L.push('BEGIN:VEVENT', `UID:${it.uid}@gokaku-note`, `DTSTAMP:${stamp}`)
    if (it.allDay) L.push(`DTSTART;VALUE=DATE:${it.start}`, `DTEND;VALUE=DATE:${it.end}`, 'TRANSP:TRANSPARENT')
    else L.push(`DTSTART;TZID=Asia/Tokyo:${it.start}`, `DTEND;TZID=Asia/Tokyo:${it.end}`)
    if (it.until) L.push(`RRULE:FREQ=DAILY;UNTIL=${untilUTC(it.until)}`)
    L.push(`SUMMARY:${escText(it.title)}`, `DESCRIPTION:${escText(it.desc)}`)
    for (const tr of it.alarms || []) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escText(it.title)}`, `TRIGGER:${tr}`, 'END:VALARM')
    L.push('END:VEVENT')
  }
  L.push('END:VCALENDAR')
  return L.map(fold).join('\r\n') + '\r\n'
}

// ---- Google カレンダーの登録リンク（1件ずつ） ----
export function googleLink(it) {
  const p = new URLSearchParams({ action: 'TEMPLATE', text: it.title, dates: `${it.start}/${it.end}`, details: it.desc })
  if (!it.allDay) p.set('ctz', 'Asia/Tokyo')
  if (it.until) p.set('recur', `RRULE:FREQ=DAILY;UNTIL=${ymdc(it.until)}`)
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

export function describe(it) {
  if (it.allDay) { const d = parseYmd(`${it.start.slice(0, 4)}-${it.start.slice(4, 6)}-${it.start.slice(6, 8)}`); return `${d.getMonth() + 1}月${d.getDate()}日（終日）` }
  return `毎日 ${it.start.slice(9, 11)}:${it.start.slice(11, 13)}〜（${it.until ? `${Number(it.until.slice(5, 7))}月${Number(it.until.slice(8, 10))}日まで` : ''}）`
}
