// 受験日から逆算した、1日の目安と進み具合
import { store } from './store.js'
import { cert as getCert } from './data.js'
import { certStats } from './srs.js'
import { today, daysBetween, addDays } from './util.js'

// 1問あたりの時間の目安（秒）。記録があれば、その平均を使う
const SEC_PER_Q = { itpass: 70, sg: 90, jstqb: 75, genai: 45, ga4: 55, gads: 55, 'line-basic': 45, 'line-adv': 50 }

function secPerQuestion(certId) {
  const ss = store.get().sessions.filter((x) => x.cert === certId && x.durationSec && x.total && !['manual', 'drill', 'tquiz'].includes(x.mode)).slice(0, 10)
  const n = ss.reduce((a, x) => a + x.total, 0)
  if (n >= 20) return Math.max(20, Math.min(240, ss.reduce((a, x) => a + x.durationSec, 0) / n))
  return SEC_PER_Q[certId] || 60
}

// 受験日を入れたとき（変えたとき）に、計画の起点を記録する
export function startPlan(certId, date) {
  const e = store.get().exams[certId] || {}
  if (!date) return null
  if (e.plan && e.plan.target === date) return e.plan
  return { from: today(), seen0: certStats(certId).seen, target: date }
}

export function examPlan(certId) {
  const s = store.get()
  const c = getCert(certId)
  const e = s.exams[certId] || {}
  if (!c || !e.date || e.result === '合格') return null
  const d = today()
  const left = daysBetween(d, e.date)
  if (left < 0) return null
  const st = certStats(certId)
  // 最後の1週間は、模擬試験と苦手の解き直しにあてる
  const buffer = left > 21 ? 7 : left > 10 ? 3 : 0
  const studyDays = Math.max(1, left - buffer)
  const finishBy = addDays(d, studyDays)
  const unseen = Math.max(0, st.total - st.seen)
  const newPerDay = unseen ? Math.ceil(unseen / studyDays) : 0
  // 復習は、いま期限が来ている分を数日で片付け、そのあとは新しく解いた分のおよそ半分が毎日戻ってくる目安
  const reviewPerDay = Math.ceil(st.due / Math.min(3, studyDays) + newPerDay * 0.5)
  const qPerDay = newPerDay + reviewPerDay
  const sec = secPerQuestion(certId)
  const minPerDay = Math.max(10, Math.round((qPerDay * sec) / 60 / 5) * 5)
  // 勉強時間の目安（ガイドの数字）との比較
  const needMin = Math.max(0, c.hours[0] * 60 - st.minutes)
  const hoursPerDay = left ? Math.round(needMin / Math.max(1, left)) : needMin
  // 進み具合：計画を立てた日からの、解いた問題の数の進み方
  let pace = null
  const p = e.plan && e.plan.target === e.date ? e.plan : null
  if (p && unseen > 0) {
    const span = Math.max(1, daysBetween(p.from, addDays(e.date, -buffer)))
    const passed = Math.min(span, Math.max(0, daysBetween(p.from, d)))
    const goalSeen = Math.min(st.total, p.seen0 + ((st.total - p.seen0) * passed) / span)
    const diff = Math.round(st.seen - goalSeen)
    if (passed >= 2) pace = { diff, behind: diff < -Math.max(5, st.total * 0.03), ahead: diff > Math.max(5, st.total * 0.03) }
  }
  const todayDone = s.sessions.filter((x) => x.cert === certId && x.date === d).reduce((a, x) => a + (x.total || 0), 0)
  let phase = 'learn'
  if (left <= buffer || unseen === 0) phase = 'final'
  return { cert: c, date: e.date, left, buffer, studyDays, finishBy, unseen, newPerDay, reviewPerDay, qPerDay, minPerDay, needMin, hoursPerDay, pace, todayDone, phase, st }
}

// いちばん近い受験日の計画（ホーム用）
export function nearestPlan() {
  const s = store.get()
  const ids = Object.keys(s.exams).filter((id) => getCert(id))
  const plans = ids.map(examPlan).filter(Boolean).sort((a, b) => a.left - b.left)
  return plans[0] || null
}
