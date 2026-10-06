// 問題演習・模擬試験・結果
import { store } from '../store.js'
import { questions, cert as getCert, catName, extrasOf, summaries } from '../data.js'
import { icon } from '../icons.js'
import { esc, richText, shuffle, uid, pct, fmtClock, vibrate, today } from '../util.js'
import { recordAnswer, setReason, toggleMark, pickSmart, pickMock, dueList } from '../srs.js'
import { ring, bar, animateIn, confirmDialog, toast, sheet, confetti, loadError } from '../ui.js'
import { go } from '../nav.js'
import { openLogForm } from './log.js'
import { inScope, isNewId } from '../scope.js'
import { openFlagSheet, isFlagged } from './flagsheet.js'
import { canSpeak, speak, stopSpeak, speechText, isSpeaking } from '../speech.js'
import { openSummarySheet } from './summary.js'

export const KANA = ['ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク', 'ケ', 'コ']
const ALPHA = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
const KANA_CERTS = ['itpass', 'sg', 'jstqb', 'genai']
export const REASONS = [
  { id: 'unknown', label: '知らなかった', hint: '教材に戻って覚える' },
  { id: 'misread', label: '読み違えた', hint: 'どこで読み違えたかを確認' },
  { id: 'unsure', label: '迷って外した', hint: '2つの違いを一言で書く' },
]
const MODE_TITLE = { smart: 'おまかせ学習', cat: '分野別', wrong: '間違えた問題', unsure: '迷った問題', new: 'まだ解いていない問題', mock: '模擬試験', mark: '印をつけた問題', retry: '解き直し', due: '今日の復習', all: 'すべての問題', newscope: '2027年からの新しい範囲', flagged: '報告した問題', search: '検索した問題' }
// 本番と同じように、最後にまとめて採点する形式
const EXAM_MODES = ['mock', 'pastexam']

// 問題文の「［図1］」を、切り出した図に置きかえる
export function stemHTML(q) {
  let h = richText(q.stem)
  const figs = Array.isArray(q.figs) ? q.figs : []
  if (!figs.length) return h
  const img = (f, i) => `<figure class="q-fig"><img src="data/extra/img/${esc(f)}" alt="図${i + 1}" loading="lazy" data-zoom="${esc(f)}"></figure>`
  let used = 0
  figs.forEach((f, i) => {
    const mk = `［図${i + 1}］`
    if (h.includes(mk)) { h = h.split(mk).join(img(f, i)); used++ }
  })
  if (!used) h += figs.map(img).join('')
  return h.replace(/(<br>)+(<figure)/g, '$2').replace(/(<\/figure>)(<br>)+/g, '$1')
}
export function sourceHTML(q) {
  if (!q.source) return ''
  const isPast = /^出典：/.test(q.source)
  return `<div class="src">${isPast ? `${esc(q.source)}<br>問題文は IPA の公開問題の原文です（図は問題冊子から切り出し、表は文字に起こしています）。解説はこのアプリが作成したものです。` : `根拠：${esc(q.source)}`}</div>`
}
export function noteHTML(q) {
  return q.note ? `<div class="q-note">${icon('alert', 'xs')}<span><b>出題のあとに変わった点：</b>${esc(q.note)}</span></div>` : ''
}
// 読み上げ用の文
export function questionSpeech(q, ord, labels) {
  return speechText(q.stem) + '。' + ord.map((oi, k) => `${labels[k]}、${speechText(q.choices[oi])}`).join('。')
}
export function openFigure(file) {
  sheet({ title: '図', body: `<div class="fig-zoom"><img src="data/extra/img/${esc(file)}" alt="図"></div><p class="xsmall muted" style="margin:8px 0 0">2本の指で広げると、大きくできます。</p>` })
}

// ---- クイズを始める ----
export async function startQuiz({ cert, mode = 'smart', cat = null, n = null, ids = null, title = null, set = null }) {
  const c = getCert(cert)
  const cur = store.get().active
  if (cur && !cur.finished && Object.values(cur.answers || {}).some((x) => x.done || (x.sel && x.sel.length))) {
    const ok = await confirmDialog({
      title: cur.mode === 'mock' ? '途中の模擬試験があります' : '途中の問題があります',
      message: `「${getCert(cur.cert)?.short || ''}：${cur.title}」の途中経過は消えます。新しく始めますか？`,
      ok: '新しく始める', cancel: 'やめる', danger: true,
    })
    if (!ok) return
  }
  let all0
  try { all0 = await questions(cert) } catch (e) { toast('問題を読み込めませんでした。電波のよいところで、もう一度お試しください'); return }
  if (!all0.length) { toast('この資格の問題はまだ準備中です'); return }
  const s = store.get()
  const size = n || s.profile.quizSize || 10
  // 2027年からの新しい範囲は、設定に合わせてふだんの出題から外す（印・解き直し・指定の問題は外さない）
  const all = all0.filter((q) => inScope(q, cert))
  const bySet = (set) => all0.filter((q) => q.set === set).sort((a, b) => (a.no || 0) - (b.no || 0))
  let list = []
  let limitSec = 0
  if (ids) list = ids.map((id) => all0.find((q) => q.id === id)).filter(Boolean)
  else if (mode === 'smart') list = pickSmart(cert, all, size)
  else if (mode === 'cat') list = pickSmart(cert, all0.filter((q) => q.cat === cat && (inScope(q, cert) || /^n\d/.test(cat))), size)
  else if (mode === 'wrong') list = shuffle(all.filter((q) => s.q[q.id] && s.q[q.id].lastOk === false)).slice(0, size)
  else if (mode === 'unsure') list = shuffle(all.filter((q) => s.q[q.id] && s.q[q.id].unsure && s.q[q.id].lastOk !== false)).slice(0, size)
  else if (mode === 'mark') list = shuffle(all0.filter((q) => s.q[q.id] && s.q[q.id].mark)).slice(0, size)
  else if (mode === 'flagged') list = all0.filter((q) => s.flags && s.flags[q.id]).slice(0, 30)
  else if (mode === 'new') list = shuffle(all.filter((q) => !(s.q[q.id] && s.q[q.id].seen))).slice(0, size)
  else if (mode === 'due') list = shuffle(dueList(all)).slice(0, size)
  else if (mode === 'mock') list = pickMock(cert, all.filter((q) => !isNewId(q.id)), c.mock.count)
  else if (mode === 'newscope') list = pickSmart(cert, all0.filter((q) => isNewId(q.id)), size)
  else if (mode === 'past') {
    // 公開問題を、まだ解いていない問題から番号順に
    const qs = bySet(set)
    const fresh = qs.filter((q) => !(s.q[q.id] && s.q[q.id].seen))
    list = (fresh.length ? fresh : shuffle(qs.filter((q) => s.q[q.id] && s.q[q.id].lastOk === false)).concat(shuffle(qs))).slice(0, size)
    list = [...new Set(list)]
  } else if (mode === 'pastexam') {
    list = bySet(set)
    const ex = extrasOf(cert).find((x) => x.set === set)
    limitSec = Math.round(((ex && ex.minutes) || c.mock.minutes) * 60)
  }
  if (!list.length) { toast('対象の問題がありません'); return }
  if (mode === 'mock') limitSec = Math.round(c.mock.minutes * 60 * Math.min(1, list.length / c.mock.count))
  const order = {}
  for (const q of list) {
    const idx = q.choices.map((_, i) => i)
    // 公開問題などは、解説が記号（ア・イ…）で説明しているので、順番を入れかえない
    order[q.id] = s.profile.shuffle && !q.fixed ? shuffle(idx) : idx
  }
  const ex = set ? extrasOf(cert).find((x) => x.set === set) : null
  s.active = {
    id: uid(), cert, mode, cat, set: set || null,
    title: title || (mode === 'cat' ? catName(cert, cat) : (mode === 'past' || mode === 'pastexam') && ex ? `${ex.title}${mode === 'pastexam' ? '（本番形式）' : ''}` : MODE_TITLE[mode] || '練習'),
    ids: list.map((q) => q.id), idx: 0, order, answers: {}, flags: {},
    // 問題がまだ本番の数に届かない資格は、問題数に合わせて時間を短くする
    startedAt: Date.now(), limitSec, finished: false,
  }
  store.commit(true)
  go('#/quiz')
}

// ---- 画面 ----
export async function render(el) {
  const s = store.get()
  const A = s.active
  if (!A) {
    el.innerHTML = `<div class="empty" style="padding-top:30vh">${icon('info')}<div>進行中の問題はありません</div><br><a class="btn soft" href="#/home">ホームへ</a></div>`
    return
  }
  const c = getCert(A.cert)
  let all
  try { all = await questions(A.cert) } catch (e) {
    // 途中の記録は消さずに、もう一度読み込めるようにする
    loadError(el, () => render(el), `#/cert/${A.cert}`)
    return
  }
  const byId = Object.fromEntries(all.map((q) => [q.id, q]))
  const list = A.ids.map((id) => byId[id]).filter(Boolean)
  if (!list.length) { s.active = null; store.commit(true); go('#/home', { replace: true }); return }
  const labels = KANA_CERTS.includes(A.cert) ? KANA : ALPHA
  const isMock = EXAM_MODES.includes(A.mode)
  let tick = null
  let keyHandler = null

  const q = () => list[A.idx]
  const ans = (id = q().id) => A.answers[id]
  // 分野の要点まとめ（読み込めたら、まちがえた問題の解説の下にリンクを出す）
  let sums = null
  summaries(A.cert).then((x) => { sums = x; if (!A.finished && ans() && ans().done) draw() }).catch(() => {})
  const hasSum = (cat) => !!(sums && sums.cats && sums.cats[cat])
  const speakNow = (key, text) => {
    if (isSpeaking(key)) { stopSpeak(); draw(); return }
    speak(text, { key, onend: () => { if (document.body.contains(el)) refreshSpeakButtons() } })
    refreshSpeakButtons()
  }
  const refreshSpeakButtons = () => {
    el.querySelectorAll('[data-act="speakq"]').forEach((b) => b.classList.toggle('on', isSpeaking('q')))
    el.querySelectorAll('[data-act="speake"]').forEach((b) => b.classList.toggle('on', isSpeaking('e')))
  }

  function draw() {
    if (A.finished) return drawResult()
    const cur = q()
    const a = ans()
    const answered = !isMock && a && a.done
    const multi = cur.answer.length > 1
    const ord = A.order[cur.id] || cur.choices.map((_, i) => i)
    const sel = (a && a.sel) || []
    const rec = s.q[cur.id]
    const marked = rec && rec.mark
    const longStem = cur.stem.length > 260
    const progress = isMock ? Object.values(A.answers).filter((x) => x.sel && x.sel.length).length / list.length : (A.idx + (answered ? 1 : 0)) / list.length

    el.innerHTML = `
      <div class="quiz-top">
        <button class="icon-btn" data-act="quit" aria-label="やめる">${icon('x')}</button>
        ${bar(progress)}
        ${isMock ? `<span class="timer-pill" id="tp">${icon('clock', 'xs')}<span>--:--</span></span>` : ''}
        <span class="count">${A.idx + 1} / ${list.length}</span>
        <button class="icon-btn" data-act="mark" aria-pressed="${!!marked}" aria-label="${marked ? '印を外す' : 'あとで見直す印をつける'}" style="${marked ? 'color:var(--warn)' : ''}">${icon('flag', 'sm')}</button>
        ${isMock ? `<button class="icon-btn" data-act="nav" aria-label="問題の一覧">${icon('list')}</button>` : ''}
      </div>
      <div class="q-meta">
        <span class="chip" style="background:color-mix(in srgb, ${c.color} 14%, transparent);color:${c.color}">${esc(c.short)}</span>
        <span class="chip">${esc(catName(A.cert, cur.cat))}</span>
        ${cur.kind === 'past' ? `<span class="chip primary">${icon('medal', 'xs')}公開問題 問${cur.no}</span>` : isNewId(cur.id) ? `<span class="chip warn">2027年〜</span>` : ''}
        ${isFlagged(cur.id) ? `<span class="chip ng">${icon('flag', 'xs')}報告済み</span>` : ''}
        <span class="diff" aria-label="難しさ ${cur.difficulty}">${[1, 2, 3].map((i) => `<i class="${i <= cur.difficulty ? 'on' : ''}"></i>`).join('')}</span>
        ${canSpeak() ? `<button class="icon-btn speak-btn ${isSpeaking('q') ? 'on' : ''}" data-act="speakq" aria-label="問題を読み上げる">${icon('volume', 'sm')}</button>` : ''}
      </div>
      <div class="q-stem ${longStem ? 'long' : ''}">${stemHTML(cur)}</div>
      ${multi ? `<div class="q-hint">${icon('check', 'xs')}${cur.answer.length}つ選んでください</div>` : ''}
      <div class="choices ${answered ? 'locked' : ''}" role="${multi ? 'group' : 'radiogroup'}">
        ${ord.map((oi, k) => {
          let cls = ''
          if (answered) {
            if (cur.answer.includes(oi)) cls = 'correct'
            else if (sel.includes(oi)) cls = 'wrong'
            else cls = 'dim'
          } else if (sel.includes(oi)) cls = 'sel'
          return `<button class="choice ${multi ? 'multi' : ''} ${cls}" data-oi="${oi}" role="${multi ? 'checkbox' : 'radio'}" aria-checked="${sel.includes(oi)}">
            <span class="lbl">${answered && cur.answer.includes(oi) ? icon('check', 'xs') : answered && sel.includes(oi) ? icon('x', 'xs') : labels[k]}</span><span>${richText(cur.choices[oi])}</span></button>`
        }).join('')}
      </div>
      ${answered ? feedbackHTML(cur, a, ord, labels) : ''}
      <div class="quiz-foot">
        ${isMock ? mockFoot(cur) : answered ? `
          <button class="btn primary lg grow" data-act="next">${A.idx + 1 >= list.length ? '結果を見る' : '次の問題へ'}${icon('right')}</button>` : `
          <button class="unsure-toggle ${a && a.unsure ? 'on' : ''}" data-act="unsure" aria-pressed="${!!(a && a.unsure)}">${icon('help', 'sm')}迷った</button>
          <button class="btn primary lg grow" data-act="submit" ${sel.length === (multi ? cur.answer.length : 1) ? '' : 'disabled'}>回答する</button>`}
      </div>`
    animateIn(el)
    if (isMock) updateTimer()
    if (answered) {
      const fb = el.querySelector('.feedback')
      if (fb) setTimeout(() => fb.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    }
  }

  function feedbackHTML(cur, a, ord, labels) {
    const correctLabels = ord.map((oi, k) => (cur.answer.includes(oi) ? labels[k] : null)).filter(Boolean).join('・')
    const r = s.q[cur.id] || {}
    return `
      <div class="feedback ${a.correct ? 'ok' : 'ng'}" role="status">
        <span class="fb-ic">${icon(a.correct ? 'check' : 'x')}</span>
        <div>${a.correct ? (a.unsure ? '正解（迷った問題として復習に入れます）' : '正解') : '不正解'}<div class="small" style="font-weight:600;opacity:.85">正解は ${correctLabels}</div></div>
      </div>
      <div class="explain">
        <h4>${icon('book', 'xs')}解説${canSpeak() ? `<button class="icon-btn speak-btn ${isSpeaking('e') ? 'on' : ''}" data-act="speake" aria-label="解説を読み上げる" style="margin-left:auto">${icon('volume', 'xs')}</button>` : ''}</h4>
        <div>${richText(cur.explanation)}</div>
        ${noteHTML(cur)}
        ${sourceHTML(cur)}
        <div class="explain-foot">
          ${!a.correct && hasSum(cur.cat) ? `<button class="link-btn" data-act="sum">${icon('list', 'xs')}「${esc(catName(A.cert, cur.cat))}」の要点を読む</button>` : ''}
          <button class="link-btn muted" data-act="flagq">${icon('flag', 'xs')}${isFlagged(cur.id) ? '報告した内容を見る' : 'この問題、おかしい？'}</button>
        </div>
      </div>
      ${!a.correct ? `<div class="reason"><p>なぜ間違えた？（記録すると復習に役立ちます）</p>
        <div class="chips">${REASONS.map((x) => `<button class="chip outline ${r.reason === x.id ? 'on' : ''}" data-reason="${x.id}">${x.label}</button>`).join('')}</div>
        ${r.reason ? `<p class="small muted" style="margin-top:8px;font-weight:600">${esc(REASONS.find((x) => x.id === r.reason).hint)}</p>` : ''}</div>` : ''}`
  }

  function mockFoot(cur) {
    const flagged = A.flags[cur.id]
    return `
      <button class="btn ghost" data-act="prev" ${A.idx === 0 ? 'disabled' : ''} aria-label="前の問題">${icon('left')}</button>
      <button class="unsure-toggle ${flagged ? 'on' : ''}" data-act="flag">${icon('flag', 'sm')}見直し</button>
      ${A.idx + 1 >= list.length
        ? `<button class="btn primary grow" data-act="finish">解答を終える</button>`
        : `<button class="btn primary grow" data-act="mnext">次へ${icon('right')}</button>`}`
  }

  function updateTimer() {
    const tp = el.querySelector('#tp')
    if (!tp) return
    const left = A.limitSec - (Date.now() - A.startedAt) / 1000
    tp.querySelector('span').textContent = fmtClock(left)
    tp.classList.toggle('low', left < 300)
    if (left <= 0 && !A.finished) {
      toast('時間になりました。採点します')
      finishMock()
    }
  }

  function select(oi) {
    const cur = q()
    const multi = cur.answer.length > 1
    const a = (A.answers[cur.id] ||= { sel: [] })
    if (a.done) return
    if (multi) {
      a.sel = a.sel.includes(oi) ? a.sel.filter((x) => x !== oi) : [...a.sel, oi]
      if (a.sel.length > cur.answer.length) a.sel = a.sel.slice(-cur.answer.length)
    } else {
      a.sel = [oi]
    }
    if (s.profile.vibrate) vibrate(8)
    store.commit()
    draw()
  }

  function submit() {
    const cur = q()
    const a = A.answers[cur.id]
    if (!a || !a.sel.length) return
    const correct = a.sel.length === cur.answer.length && a.sel.every((x) => cur.answer.includes(x))
    a.correct = correct
    a.done = true
    a.t = Date.now()
    recordAnswer(cur, correct, { unsure: !!a.unsure })
    if (s.profile.vibrate) vibrate(correct ? 18 : [30, 60, 30])
    store.commit(true)
    draw()
  }

  function next() {
    stopSpeak()
    if (A.idx + 1 >= list.length) return finishPractice()
    A.idx++
    store.commit()
    draw()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function summarize() {
    const cats = {}
    let correct = 0, unsure = 0
    const fields = {}
    for (const qq of list) {
      const a = A.answers[qq.id] || {}
      const ok = !!a.correct
      if (ok) correct++
      if (a.unsure) unsure++
      const cc = (cats[qq.cat] ||= [0, 0])
      cc[0]++
      if (ok) cc[1]++
      const f = c.catById[qq.cat] && c.catById[qq.cat].field
      if (f) { const ff = (fields[f] ||= [0, 0]); ff[0]++; if (ok) ff[1]++ }
    }
    return { total: list.length, correct, unsure, cats, fields }
  }

  function passCheck(sum) {
    const rate = sum.total ? sum.correct / sum.total : 0
    if (!isMock) return { line: 0.8, passed: rate >= 0.8, fieldsOk: true }
    const line = c.mock.pass
    let fieldsOk = true
    if (c.fields) {
      for (const f of c.fields) {
        const v = sum.fields[f.id]
        if (v && v[0] && v[1] / v[0] < f.min) fieldsOk = false
      }
    }
    return { line, passed: rate >= line && fieldsOk, fieldsOk }
  }

  function finishPractice() {
    A.finished = true
    A.endedAt = Date.now()
    const sum = summarize()
    const pc = passCheck(sum)
    store.addSession({
      cert: A.cert, mode: A.mode, title: A.title, total: sum.total, correct: sum.correct, unsure: sum.unsure,
      cats: sum.cats, fields: sum.fields, durationSec: Math.round((A.endedAt - A.startedAt) / 1000), passed: pc.passed,
      source: A.set ? 'IPA 公開問題' : 'アプリの練習問題', set: A.set || undefined,
    })
    A.sessionSaved = true
    store.commit(true)
    if (pc.passed) setTimeout(confetti, 350)
    draw()
    window.scrollTo(0, 0)
  }

  async function finishMock(ask = false) {
    if (A.finished) return
    if (ask) {
      const unanswered = list.filter((qq) => !(A.answers[qq.id] && A.answers[qq.id].sel && A.answers[qq.id].sel.length)).length
      const ok = await confirmDialog({ title: '解答を終えて採点しますか？', message: unanswered ? `まだ答えていない問題が ${unanswered} 問あります。` : '採点したあとは、答えを変えられません。', ok: '採点する', cancel: '戻る' })
      if (!ok) return
    }
    clearInterval(tick)
    for (const qq of list) {
      const a = (A.answers[qq.id] ||= { sel: [] })
      a.correct = a.sel.length === qq.answer.length && a.sel.every((x) => qq.answer.includes(x))
      a.done = true
      // 「見直し」の印は試験中の目印なので、復習の間隔には使わない
      recordAnswer(qq, a.sel.length ? a.correct : false)
    }
    finishPractice()
  }

  function drawResult() {
    const sum = summarize()
    const pc = passCheck(sum)
    const rate = sum.total ? sum.correct / sum.total : 0
    const dur = Math.round(((A.endedAt || Date.now()) - A.startedAt) / 1000)
    const wrongIds = list.filter((qq) => !(A.answers[qq.id] || {}).correct).map((qq) => qq.id)
    const unsureIds = list.filter((qq) => (A.answers[qq.id] || {}).unsure).map((qq) => qq.id)
    const retryIds = [...new Set([...wrongIds, ...unsureIds])]
    const catRows = Object.entries(sum.cats).sort((a, b) => a[1][1] / a[1][0] - b[1][1] / b[1][0])
    el.innerHTML = `
      <div class="quiz-top"><button class="icon-btn" data-act="close" aria-label="閉じる">${icon('x')}</button><div class="grow" style="font-weight:800">${esc(A.title)}の結果</div></div>
      <div class="result-hero">
        ${ring(rate, { size: 150, stroke: 13, label: `${pct(sum.correct, sum.total)}<small style="font-size:14px">%</small>`, sub: `${sum.correct} / ${sum.total}問` })}
        <h2>${pc.passed ? (isMock ? '合格ラインを超えました' : '8割を超えました') : isMock ? 'もう少しです' : 'おつかれさまでした'}</h2>
        <div class="muted small">${isMock ? `合格の目安 ${Math.round(pc.line * 100)}%${c.fields ? '（各分野3割以上も必要）' : ''}` : '受験申込みの目安は、安定して8割'} ・ かかった時間 ${fmtClock(dur)}</div>
        <div class="verdict ${pc.passed ? 'ok' : 'ng'}">${icon(pc.passed ? 'trophy' : 'target', 'sm')}${pc.passed ? (isMock ? '合格圏' : '目標達成') : isMock ? (pc.fieldsOk ? '合格ラインまであと少し' : '基準に届かない分野があります') : `目標まであと ${Math.max(0, Math.ceil(sum.total * 0.8) - sum.correct)}問`}</div>
      </div>
      ${c.fields && Object.keys(sum.fields).length ? `<div class="card section"><div class="section-h"><h2>分野別</h2></div>
        ${c.fields.map((f) => { const v = sum.fields[f.id]; if (!v) return ''; const r = v[1] / v[0]; return `<div class="cat-row" style="cursor:default"><span class="nm">${esc(f.name)}</span><span class="pct" style="color:${r < f.min ? 'var(--ng)' : 'inherit'}">${pct(v[1], v[0])}%</span>${bar(r, r < f.min ? 'ng' : r >= 0.6 ? 'ok' : 'warn', f.min)}<span class="sub">${v[1]} / ${v[0]}問 ・ 基準 ${Math.round(f.min * 100)}%</span></div>` }).join('')}</div>` : ''}
      <div class="card section"><div class="section-h"><h2>分野ごとの正答率</h2></div>
        ${catRows.map(([cat, v]) => { const r = v[1] / v[0]; return `<div class="cat-row" style="cursor:default"><span class="nm">${esc(catName(A.cert, cat))}</span><span class="pct">${v[1]}/${v[0]}</span>${bar(r, r >= 0.8 ? 'ok' : r >= 0.6 ? 'warn' : 'ng')}</div>` }).join('')}
      </div>
      <div class="section col">
        ${retryIds.length ? `<button class="btn primary block lg" data-act="retry">${icon('rotate')}間違えた・迷った ${retryIds.length}問を解き直す</button>` : ''}
        <button class="btn soft block" data-act="log">${icon('edit', 'sm')}学習ログに記録する</button>
        <button class="btn ghost block" data-act="certpage">${esc(c.short)}のページへ</button>
      </div>
      <div class="card section"><div class="section-h"><h2>ふりかえり</h2><span class="small muted">タップで解説</span></div>
        ${list.map((qq, i) => reviewItem(qq, i, labels)).join('')}
      </div>`
    animateIn(el)
    el.querySelector('[data-act="retry"]')?.addEventListener('click', () => startQuiz({ cert: A.cert, mode: 'retry', ids: shuffle(retryIds), title: '解き直し' }))
  }

  function reviewItem(qq, i, labels) {
    const a = A.answers[qq.id] || { sel: [] }
    const ord = A.order[qq.id] || qq.choices.map((_, k) => k)
    const lab = (oi) => labels[ord.indexOf(oi)]
    const r = s.q[qq.id] || {}
    return `<details class="review-item">
      <summary><div class="row" style="gap:8px">
        <span class="chip ${a.correct ? 'ok' : 'ng'}">${icon(a.correct ? 'check' : 'x', 'xs')}問${i + 1}</span>
        ${a.unsure ? '<span class="chip warn">迷った</span>' : ''}${isMock && A.flags[qq.id] ? '<span class="chip warn">見直し</span>' : ''}
        <span class="xsmall muted ellipsis grow">${esc(catName(A.cert, qq.cat))}</span>${icon('down', 'sm')}
      </div><div class="st">${esc(qq.stem.replace(/```[\s\S]*?```/g, '［コード］').slice(0, 90))}${qq.stem.length > 90 ? '…' : ''}</div></summary>
      <div class="q-stem long" style="margin:10px 0">${stemHTML(qq)}</div>
      <div class="col" style="gap:6px">
        ${ord.map((oi, k) => `<div class="small" style="display:flex;gap:8px;padding:8px 10px;border-radius:10px;background:${qq.answer.includes(oi) ? 'var(--ok-soft)' : a.sel.includes(oi) ? 'var(--ng-soft)' : 'var(--surface-2)'}"><b>${labels[k]}</b><span>${richText(qq.choices[oi])}</span></div>`).join('')}
      </div>
      <p class="small"><b>あなたの答え：</b>${a.sel.length ? a.sel.map(lab).join('・') : '未回答'} ／ <b>正解：</b>${qq.answer.map(lab).join('・')}</p>
      <div class="explain">${richText(qq.explanation)}${noteHTML(qq)}${sourceHTML(qq)}<div class="explain-foot"><button class="link-btn muted" data-act="flagq" data-qid="${esc(qq.id)}">${icon('flag', 'xs')}${isFlagged(qq.id) ? '報告した内容を見る' : 'この問題、おかしい？'}</button></div></div>
      ${!a.correct ? `<div class="reason"><p>なぜ間違えた？</p><div class="chips">${REASONS.map((x) => `<button class="chip outline ${r.reason === x.id ? 'on' : ''}" data-reason="${x.id}" data-qid="${esc(qq.id)}">${x.label}</button>`).join('')}</div></div>` : ''}
    </details>`
  }

  function openNav() {
    sheet({
      title: '問題の一覧',
      body: `<p class="small muted" style="margin-top:0">色つきは解答済み、点は「見直し」の印です。</p>
        <div class="navgrid">${list.map((qq, i) => `<button data-go="${i}" class="${(A.answers[qq.id] && A.answers[qq.id].sel && A.answers[qq.id].sel.length) ? 'ans' : ''} ${A.flags[qq.id] ? 'flag' : ''} ${i === A.idx ? 'cur' : ''}">${i + 1}</button>`).join('')}</div>
        <div style="margin-top:18px"><button class="btn primary block" data-finish>解答を終えて採点する</button></div>`,
      onMount(body, close) {
        body.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { A.idx = Number(b.dataset.go); store.commit(); close(); draw() }))
        body.querySelector('[data-finish]').onclick = () => { close(); finishMock(true) }
      },
    })
  }

  async function quit() {
    if (A.finished) return leave()
    const answeredCount = isMock
      ? Object.values(A.answers).filter((x) => x.sel && x.sel.length).length
      : Object.values(A.answers).filter((x) => x.done).length
    if (answeredCount === 0) return leave()
    if (isMock) {
      const ok = await confirmDialog({ title: '模擬試験を中断しますか？', message: '中断すると、この回の解答は採点されません（時間は止まりません）。あとで続きから再開することもできます。', ok: '中断してホームへ', cancel: '続ける' })
      if (ok) go(`#/cert/${A.cert}`)
      return
    }
    const ok = await confirmDialog({ title: 'ここで終わりますか？', message: `ここまでの ${answeredCount} 問を結果として記録します。`, ok: '終わる', cancel: '続ける' })
    if (!ok) return
    // 答えた問題だけで結果にする
    const done = list.filter((qq) => A.answers[qq.id] && A.answers[qq.id].done)
    if (!done.length) return leave()
    A.ids = done.map((qq) => qq.id)
    list.splice(0, list.length, ...done)
    finishPractice()
  }
  function leave() {
    const cid = A.cert
    s.active = null
    store.commit(true)
    go(`#/cert/${cid}`)
  }

  el.addEventListener('click', (e) => {
    const z = e.target.closest('img[data-zoom]')
    if (z) { if (z.closest('.choice')) return; openFigure(z.dataset.zoom); return }
    const t = e.target.closest('button')
    if (!t) return
    if (t.dataset.oi != null) return select(Number(t.dataset.oi))
    if (t.dataset.reason) {
      const qid = t.dataset.qid || q().id
      const cur = s.q[qid] && s.q[qid].reason
      setReason(qid, cur === t.dataset.reason ? null : t.dataset.reason)
      if (A.finished) {
        t.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === t && cur !== t.dataset.reason))
      } else draw()
      return
    }
    const act = t.dataset.act
    if (act === 'speakq') { const cur = q(); return speakNow('q', questionSpeech(cur, A.order[cur.id] || cur.choices.map((_, i) => i), labels)) }
    if (act === 'speake') {
      const cur = q(); const ord = A.order[cur.id] || cur.choices.map((_, i) => i)
      const cl = ord.map((oi, k) => (cur.answer.includes(oi) ? labels[k] : null)).filter(Boolean).join('、')
      return speakNow('e', `正解は、${cl}。${speechText(cur.explanation)}`)
    }
    if (act === 'flagq') {
      const qq = t.dataset.qid ? list.find((x) => x.id === t.dataset.qid) : q()
      if (qq) openFlagSheet(qq, { onChange: () => { if (!A.finished) draw(); else t.innerHTML = `${icon('flag', 'xs')}${isFlagged(qq.id) ? '報告した内容を見る' : 'この問題、おかしい？'}` } })
      return
    }
    if (act === 'sum') return openSummarySheet(A.cert, q().cat, sums)
    if (act === 'submit') submit()
    else if (act === 'next') next()
    else if (act === 'unsure') { const a = (A.answers[q().id] ||= { sel: [] }); a.unsure = !a.unsure; store.commit(); draw() }
    else if (act === 'mark') { const on = toggleMark(q().id); toast(on ? '印をつけました（あとで「印をつけた問題」から解けます）' : '印を外しました'); draw() }
    else if (act === 'quit' || act === 'close') quit()
    else if (act === 'prev') { stopSpeak(); A.idx = Math.max(0, A.idx - 1); store.commit(); draw() }
    else if (act === 'mnext') { stopSpeak(); A.idx = Math.min(list.length - 1, A.idx + 1); store.commit(); draw(); window.scrollTo({ top: 0 }) }
    else if (act === 'flag') { A.flags[q().id] = !A.flags[q().id]; store.commit(); draw() }
    else if (act === 'nav') openNav()
    else if (act === 'finish') finishMock(true)
    else if (act === 'log') {
      const sum = summarize()
      const minutes = Math.max(1, Math.round(((A.endedAt || Date.now()) - A.startedAt) / 60000))
      openLogForm({ cert: A.cert, minutes, what: `${A.title} ${sum.total}問（正解 ${sum.correct}問）` })
    } else if (act === 'certpage') leave()
  })

  keyHandler = (e) => {
    if (e.target.closest('input, textarea, select') || document.querySelector('.sheet, .dialog')) return
    if (A.finished) return
    const cur = q()
    const ord = A.order[cur.id] || cur.choices.map((_, i) => i)
    const n = Number(e.key)
    if (n >= 1 && n <= ord.length) { select(ord[n - 1]); e.preventDefault() }
    else if (e.key === 'Enter') {
      const b = el.querySelector('[data-act="submit"]:not([disabled]), [data-act="next"], [data-act="mnext"]')
      if (b) { b.click(); e.preventDefault() }
    } else if (isMock && e.key === 'ArrowLeft') el.querySelector('[data-act="prev"]')?.click()
    else if (isMock && e.key === 'ArrowRight') el.querySelector('[data-act="mnext"]')?.click()
  }
  document.addEventListener('keydown', keyHandler)
  if (isMock && !A.finished) tick = setInterval(updateTimer, 1000)
  draw()
  return () => {
    clearInterval(tick)
    stopSpeak()
    document.removeEventListener('keydown', keyHandler)
    // 結果を見終わって別の画面へ移ったら、進行中の記録を消す
    if (A.finished && store.get().active === A) { store.get().active = null; store.commit(true) }
  }
}
