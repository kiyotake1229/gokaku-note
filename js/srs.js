// 復習のタイミング（間隔反復）と、成績の集計
import { store } from './store.js'
import { today, addDays, shuffle, daysBetween } from './util.js'
import { cert as getCert, meta } from './data.js'
import { isNewId, newScopeOn } from './scope.js'

// 箱の番号ごとの、次に出すまでの日数
const INTERVAL = [0, 1, 3, 7, 14, 30]
export const MAX_BOX = 5
export const READY_RATE = 0.8

export const certOf = (qid) => String(qid).split(':')[0]

export function recordAnswer(q, correct, { unsure = false, reason = null } = {}) {
  const s = store.get()
  const r = (s.q[q.id] ||= { box: 0, seen: 0, ok: 0, ng: 0 })
  r.seen++
  r.last = Date.now()
  r.lastOk = !!correct
  r.cat = q.cat
  // 「迷った」は、正解したときだけ付ける（不正解の問題は「間違えた問題」で扱う）
  r.unsure = correct ? !!unsure : false
  if (correct) {
    r.ok++
    // 迷って正解したときは、箱を上げずに近いうちにもう一度
    r.box = unsure ? Math.max(1, r.box) : Math.min(MAX_BOX, (r.box || 0) + 1)
    if (!unsure) r.reason = null
  } else {
    r.ng++
    r.box = 1
    r.reason = reason || null
  }
  r.due = addDays(today(), INTERVAL[r.box] || 1)
  store.commit()
  return r
}
export function setReason(qid, reason) {
  const r = store.get().q[qid]
  if (r) { r.reason = reason; store.commit() }
}
export function toggleMark(qid) {
  const s = store.get()
  const r = (s.q[qid] ||= { box: 0, seen: 0, ok: 0, ng: 0 })
  r.mark = !r.mark
  store.commit()
  return r.mark
}

export function isDue(r, d = today()) {
  return r && r.seen > 0 && r.due && r.due <= d
}

// 用語カード
export function recordTerm(id, grade) {
  const s = store.get()
  const r = (s.t[id] ||= { box: 0, seen: 0 })
  r.seen++
  r.last = Date.now()
  r.grade = grade
  if (grade === 2) r.box = Math.min(MAX_BOX, (r.box || 0) + 1)
  else if (grade === 1) r.box = Math.max(1, r.box || 0)
  else r.box = 1
  r.due = addDays(today(), grade === 0 ? 1 : INTERVAL[r.box] || 1)
  store.commit()
}

// ---- 集計 ----
export function certStats(certId) {
  const s = store.get()
  const c = getCert(certId)
  const scopeOn = newScopeOn(certId)
  // 新しい範囲を出さない設定のときは、その問題を数に入れない
  const total = Math.max(0, ((c && c.counts && c.counts.total) || 0) - (scopeOn ? 0 : ((c && c.counts && c.counts.newTotal) || 0)))
  const prefix = certId + ':'
  let seen = 0, boxSum = 0, due = 0, wrong = 0, unsure = 0
  const d = today()
  for (const [id, r] of Object.entries(s.q || {})) {
    if (!r || !id.startsWith(prefix) || !r.seen) continue
    if (!scopeOn && isNewId(id)) continue
    seen++
    boxSum += Math.min(r.box || 0, 4)
    if (isDue(r, d)) due++
    if (r.lastOk === false) wrong++
    else if (r.unsure) unsure++
  }
  const mastery = total ? Math.min(1, boxSum / (total * 4)) : 0
  // 計算ドリルは本番の形式と違うので、申込みの目安には使わない
  const sess = s.sessions.filter((x) => x.cert === certId && x.mode !== 'drill' && x.mode !== 'tquiz')
  const recent = sess.filter((x) => x.total >= 10).slice(0, 3)
  const recentRate = recent.length ? recent.reduce((a, x) => a + x.correct, 0) / recent.reduce((a, x) => a + x.total, 0) : null
  const lastMock = sess.find((x) => x.mode === 'mock')
  const minutes = s.logs.filter((x) => x.cert === certId).reduce((a, x) => a + (Number(x.minutes) || 0), 0)
  const coverage = total ? Math.min(1, seen / total) : 0
  const stable = recent.length >= 3 && recent.every((x) => x.correct / x.total >= READY_RATE)
  const mockOk = lastMock && lastMock.correct / lastMock.total >= READY_RATE
  const ready = coverage >= 0.6 && (stable || mockOk)
  const exam = s.exams[certId] || {}
  let status = 'todo'
  if (exam.result === '合格') status = 'passed'
  else if (exam.date && exam.date >= d) status = 'booked'
  else if (seen > 0 || minutes > 0) status = 'doing'
  return { total, seen, coverage, mastery, due, wrong, unsure, recent, recentRate, lastMock, minutes, stable, mockOk, ready, status, exam }
}

export function catStats(certId, qs) {
  const s = store.get()
  const c = getCert(certId)
  const out = {}
  for (const cat of c.categories) out[cat.id] = { total: 0, seen: 0, ok: 0, n: 0, boxSum: 0 }
  for (const q of qs) {
    const o = (out[q.cat] ||= { total: 0, seen: 0, ok: 0, n: 0, boxSum: 0 })
    o.total++
    const r = s.q[q.id]
    if (r && r.seen) {
      o.seen++
      o.ok += r.ok
      o.n += r.seen
      o.boxSum += Math.min(r.box || 0, 4)
    }
  }
  for (const o of Object.values(out)) {
    o.mastery = o.total ? o.boxSum / (o.total * 4) : 0
    o.rate = o.n ? o.ok / o.n : null
  }
  return out
}

export function dueList(qs) {
  const s = store.get()
  const d = today()
  return qs.filter((q) => isDue(s.q[q.id], d))
}

// おまかせ：期限の来た復習 → 苦手な分野の未回答 → 箱の小さい問題
export function pickSmart(certId, qs, n) {
  const s = store.get()
  const d = today()
  const due = qs.filter((q) => isDue(s.q[q.id], d))
    .sort((a, b) => {
      const ra = s.q[a.id], rb = s.q[b.id]
      if (ra.due !== rb.due) return ra.due < rb.due ? -1 : 1
      return (ra.box || 0) - (rb.box || 0)
    })
  const picked = due.slice(0, Math.ceil(n * 0.7))
  const used = new Set(picked.map((q) => q.id))
  if (picked.length < n) {
    const cs = catStats(certId, qs)
    const unseen = qs.filter((q) => !(s.q[q.id] && s.q[q.id].seen) && !used.has(q.id))
    // 分野の習熟度が低い順に、少しずつ混ぜる
    const byCat = {}
    for (const q of shuffle(unseen)) (byCat[q.cat] ||= []).push(q)
    const cats = Object.keys(byCat).sort((a, b) => (cs[a]?.mastery ?? 0) - (cs[b]?.mastery ?? 0))
    let i = 0
    while (picked.length < n && cats.some((c) => byCat[c].length)) {
      const c = cats[i % cats.length]
      if (byCat[c].length) { const q = byCat[c].shift(); picked.push(q); used.add(q.id) }
      i++
    }
  }
  if (picked.length < n) {
    const rest = due.filter((q) => !used.has(q.id))
    for (const q of rest) { if (picked.length >= n) break; picked.push(q); used.add(q.id) }
  }
  if (picked.length < n) {
    const rest = shuffle(qs.filter((q) => !used.has(q.id)))
      .sort((a, b) => ((s.q[a.id]?.box || 0) - (s.q[b.id]?.box || 0)))
    for (const q of rest) { if (picked.length >= n) break; picked.push(q) }
  }
  return shuffle(picked)
}

// 模擬試験：本番の配分に合わせて選ぶ
export function pickMock(certId, qs, count) {
  const c = getCert(certId)
  const byCat = {}
  for (const q of shuffle(qs)) (byCat[q.cat] ||= []).push(q)
  let plan = {}
  if (c.mock && c.mock.dist) {
    plan = { ...c.mock.dist }
  } else if (c.fields) {
    // 分野ごとの問題数を、分野の中の問題数の比で分ける
    for (const f of c.fields) {
      const cats = c.categories.filter((x) => x.field === f.id)
      const avail = cats.reduce((a, x) => a + (byCat[x.id]?.length || 0), 0)
      let left = f.count
      cats.forEach((x, i) => {
        const k = i === cats.length - 1 ? left : Math.round((f.count * (byCat[x.id]?.length || 0)) / (avail || 1))
        plan[x.id] = Math.max(0, Math.min(k, left))
        left -= plan[x.id]
      })
    }
  } else {
    const total = qs.length || 1
    let left = count
    c.categories.forEach((x, i) => {
      const k = i === c.categories.length - 1 ? left : Math.round((count * (byCat[x.id]?.length || 0)) / total)
      plan[x.id] = Math.max(0, Math.min(k, left))
      left -= plan[x.id]
    })
  }
  const out = []
  for (const [cat, k] of Object.entries(plan)) out.push(...(byCat[cat] || []).splice(0, k))
  // 足りない分は残りから補う
  if (out.length < count) {
    const rest = shuffle(Object.values(byCat).flat())
    out.push(...rest.slice(0, count - out.length))
  }
  // 分野順にまとめて出す（本番に近い）
  const order = Object.fromEntries(c.categories.map((x, i) => [x.id, i]))
  return shuffle(out.slice(0, count)).sort((a, b) => (order[a.cat] ?? 99) - (order[b.cat] ?? 99))
}

export function streak() {
  const s = store.get()
  const days = new Set([...s.logs.map((x) => x.date), ...s.sessions.map((x) => x.date)])
  let d = today()
  if (!days.has(d)) d = addDays(d, -1)
  let n = 0
  while (days.has(d)) { n++; d = addDays(d, -1) }
  return n
}

export function minutesOn(date) {
  return store.get().logs.filter((x) => x.date === date).reduce((a, x) => a + (Number(x.minutes) || 0), 0)
}
export function answeredOn(date) {
  return store.get().sessions.filter((x) => x.date === date).reduce((a, x) => a + (x.total || 0), 0)
}

// 締切・更新などの知らせ
export function notices() {
  const out = []
  const d = today()
  const s = store.get()
  const m = meta()
  for (const c of m.certs) {
    const ex = s.exams[c.id] || {}
    for (const dl of c.deadlines || []) {
      const left = daysBetween(d, dl.date)
      if (left >= 0 && left <= 120 && ex.result !== '合格') out.push({ cert: c, kind: 'deadline', date: dl.date, left, label: dl.label })
    }
    if (ex.date && ex.date >= d && ex.result !== '合格') out.push({ cert: c, kind: 'exam', date: ex.date, left: daysBetween(d, ex.date), label: '受験日' })
    if (ex.expiry) {
      const left = daysBetween(d, ex.expiry)
      if (left <= 45) out.push({ cert: c, kind: 'expiry', date: ex.expiry, left, label: left < 0 ? '有効期限が切れています' : '有効期限（更新を忘れずに）' })
    }
  }
  return out.sort((a, b) => a.left - b.left)
}
