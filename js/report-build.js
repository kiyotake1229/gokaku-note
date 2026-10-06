// 進み具合レポートの中身を作る（アプリ側だけで使う）
import { store } from './store.js'
import { orderedCerts } from './data.js'
import { today, addDays } from './util.js'
import { certStats, streak } from './srs.js'
import { encode, baseURL } from './share.js'

const cut = (s, n = 120) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s }

export function buildReport() {
  const s = store.get()
  const d = today()
  const days = []
  for (let i = 27; i >= 0; i--) {
    const x = addDays(d, -i)
    const min = s.logs.filter((l) => l.date === x).reduce((a, l) => a + (Number(l.minutes) || 0), 0)
    const ans = s.sessions.filter((l) => l.date === x).reduce((a, l) => a + (l.total || 0), 0)
    const ok = s.sessions.filter((l) => l.date === x).reduce((a, l) => a + (l.correct || 0), 0)
    days.push([x.slice(5), min, ans, ok])
  }
  const certs = orderedCerts().map((c) => {
    const st = certStats(c.id)
    // 分野ごとの習熟度（解いた記録から）
    const byCat = {}, seenCat = {}
    for (const [id, r] of Object.entries(s.q)) {
      if (!id.startsWith(c.id + ':') || !r || !r.seen || !r.cat) continue
      byCat[r.cat] = (byCat[r.cat] || 0) + Math.min(r.box || 0, 4)
      seenCat[r.cat] = (seenCat[r.cat] || 0) + 1
    }
    const counts = (c.counts && c.counts.byCat) || {}
    // 手をつけた分野のうち、習熟度の低いもの
    const weak = Object.entries(counts).filter(([cat]) => seenCat[cat])
      .map(([cat, n]) => [cat, Math.round(((byCat[cat] || 0) / (n * 4)) * 100)]).sort((a, b) => a[1] - b[1]).slice(0, 2)
    const untouched = Object.keys(counts).filter((cat) => !seenCat[cat]).length
    const lm = st.lastMock
    const ex = s.exams[c.id] || {}
    return {
      id: c.id, st: st.status, ma: Math.round(st.mastery * 100), se: st.seen, to: st.total,
      rr: st.recentRate == null ? null : Math.round(st.recentRate * 100), mi: st.minutes, rd: st.ready ? 1 : 0,
      du: st.due, wr: st.wrong,
      mk: lm ? { d: lm.date, c: lm.correct, t: lm.total, p: lm.passed ? 1 : 0 } : null,
      wk: weak, nt: untouched,
      ex: (ex.date || ex.result || ex.applied) ? { a: ex.applied || '', d: ex.date || '', r: ex.result || '', s: ex.score || '', e: ex.expiry || '' } : null,
    }
  })
  const asks = s.logs.filter((x) => x.ask && !x.comment).slice(0, 15).map((x) => ({ id: x.id, d: x.date, c: x.cert, q: cut(x.ask, 200), w: cut(x.what, 60) }))
  const logs = s.logs.slice(0, 12).map((x) => ({ d: x.date, c: x.cert, mi: Number(x.minutes) || 0, w: cut(x.what, 70), l: cut(x.learned, 90) }))
  const recent = s.sessions.slice(0, 8).map((x) => ({ d: x.date, c: x.cert, m: x.mode, t: x.total, k: x.correct }))
  // 「この問題おかしい？」の報告（新しい順に10件まで）
  const fl = Object.entries(s.flags || {}).sort((a, b) => (b[1].t || 0) - (a[1].t || 0)).slice(0, 10)
    .map(([id, f]) => ({ id, k: f.kind || 'other', n: cut(f.note, 120), s: cut(f.stem, 60) }))
  return {
    v: 1, t: Date.now(), n: s.profile.name || '', m: s.profile.mentor || '', g: s.profile.dailyGoal || 30,
    sk: streak(), tm: s.logs.reduce((a, l) => a + (Number(l.minutes) || 0), 0),
    days, certs, asks, logs, recent, fl, fc: Object.keys(s.flags || {}).length,
  }
}

export const URL_LIMIT = 7000
export async function reportURL() {
  const data = buildReport()
  // 長すぎるときは、付けたしの情報から順に減らして短くする
  const steps = [
    (d) => { d.logs = d.logs.slice(0, 5); d.recent = d.recent.slice(0, 3) },
    (d) => { d.logs = []; d.recent = []; d.fl = d.fl.slice(0, 3) },
    (d) => { d.asks = d.asks.slice(0, 5).map((a) => ({ ...a, q: cut(a.q, 80), w: '' })) },
    (d) => { d.days = d.days.slice(-14) },
  ]
  let enc = await encode(data)
  for (const step of steps) {
    if (enc.length <= URL_LIMIT) break
    step(data)
    enc = await encode(data)
  }
  return `${baseURL()}report.html#d=${enc}`
}


// チャットに貼る用の短い文章
export function reportText(data, certById, url) {
  const week = data.days.slice(-7).reduce((a, x) => a + x[1], 0)
  const hm = (m) => (m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? (m % 60) + '分' : ''}` : `${m}分`)
  const [mm, dd] = data.days[data.days.length - 1][0].split('-').map(Number)
  const lines = [`【学習の進み具合】${mm}月${dd}日時点${data.n ? `（${data.n}）` : ''}`,
    `この7日：${hm(week)}（目標 ${hm(data.g * 7)}）・連続${data.sk}日`]
  for (const c of data.certs) {
    if (c.st === 'todo') continue
    const cm = certById[c.id]
    lines.push(`・${cm ? cm.short : c.id}：習熟${c.ma}%／${c.se}/${c.to}問${c.rr != null ? `／直近の正答率${c.rr}%` : ''}${c.mi ? `／${hm(c.mi)}` : ''}${c.st === 'passed' ? '／合格' : c.rd ? '／申込みの目安に到達' : ''}`)
  }
  if (data.asks.length) {
    lines.push('聞きたいこと：')
    data.asks.slice(0, 5).forEach((a) => lines.push(`・${a.q}`))
  }
  lines.push(`くわしく見る：${url}`)
  return lines.join('\n')
}
