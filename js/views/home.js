// ホーム
import { store } from '../store.js'
import { orderedCerts, cert as getCert, meta } from '../data.js'
import { icon } from '../icons.js'
import { esc, today, fmtDate, fmtMin, pct } from '../util.js'
import { ring, bar, animateIn, certMark } from '../ui.js'
import { certStats, streak, minutesOn, answeredOn, notices } from '../srs.js'
import { startQuiz } from './quiz.js'
import { openTimer, timerRunning } from './timer.js'
import { openLogForm } from './log.js'
import { isIOSSafariTab, iosNoticeHTML } from '../pwa.js'
import { openShareSheet } from './sharesheet.js'
import { mentorName } from '../nav.js'

const STATUS = {
  todo: ['未着手', ''],
  doing: ['学習中', 'primary'],
  booked: ['受験予定', 'warn'],
  passed: ['合格', 'ok'],
}

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'こんばんは'
  if (h < 11) return 'おはようございます'
  if (h < 18) return 'こんにちは'
  return 'こんばんは'
}

// 次にやることを1つ決める
function nextAction(stats) {
  const s = store.get()
  const certs = orderedCerts()
  const focus = s.profile.focusCert && getCert(s.profile.focusCert)
  const cand = focus && stats[focus.id].status !== 'passed' ? focus : certs.find((c) => stats[c.id].status !== 'passed' && !(c.prereq && stats[c.prereq].status !== 'passed' && stats[c.id].seen === 0))
  if (!cand) return null
  const st = stats[cand.id]
  if (st.due > 0) return { c: cand, mode: 'due', title: `復習 ${Math.min(st.due, s.profile.quizSize)}問`, desc: `期限が来た問題が ${st.due} 問あります。忘れる前に解き直しましょう。` }
  if (st.seen === 0) return { c: cand, mode: 'smart', title: 'はじめの10問', desc: 'まずは解いてみて、どんな問題が出るかを知りましょう。分からなくて当たり前です。' }
  if (st.coverage < 1) return { c: cand, mode: 'smart', title: `おまかせ ${s.profile.quizSize}問`, desc: `まだ解いていない問題が ${st.total - st.seen} 問。苦手な分野から優先して出します。` }
  if (!st.lastMock) return { c: cand, mode: 'mock', title: '模擬試験', desc: `全問に挑戦しました。本番と同じ形式で、実力を確かめましょう。` }
  return { c: cand, mode: 'smart', title: `おまかせ ${s.profile.quizSize}問`, desc: '安定して8割を超えるまで、くり返しましょう。' }
}

export async function render(el) {
  let first = true
  const draw = () => {
    const s = store.get()
    const certs = orderedCerts()
    const stats = Object.fromEntries(certs.map((c) => [c.id, certStats(c.id)]))
    const d = today()
    const todayMin = minutesOn(d)
    const goal = s.profile.dailyGoal || 30
    const st = streak()
    const nx = nextAction(stats)
    const nts = notices().slice(0, 3)
    const name = s.profile.name
    const A = s.active

    el.innerHTML = `
      <div class="topbar">
        <div class="title"></div>
        <a class="icon-btn" href="#/guide" aria-label="はじめに（学習ガイド）">${icon('book')}</a>
      </div>
      <div class="${first ? 'stagger' : ''}">
      <div>
        <div class="eyebrow">${fmtDate(d)}</div>
        <h1 class="big-title">${greeting()}${name ? `、${esc(name)}さん` : ''}</h1>
      </div>

      ${isIOSSafariTab() ? `<div class="section">${iosNoticeHTML()}</div>` : ''}
      <div class="card pad-lg section">
        <div class="hero">
          ${ring(todayMin / goal, { size: 104, stroke: 11, label: `${todayMin}<small style="font-size:12px">分</small>`, sub: `目標${goal}分` })}
          <div class="grow">
            <div style="font-weight:800;font-size:17px">${todayMin >= goal ? '今日の目標を達成！' : todayMin > 0 ? `あと${goal - todayMin}分で今日の目標` : '今日も30分から'}</div>
            <div class="row wrap" style="gap:6px;margin-top:6px">
              <span class="chip ${st > 0 ? 'warn' : ''}">${icon('flame', 'xs')}${st}日連続</span>
              <span class="chip">${icon('check', 'xs')}今日 ${answeredOn(d)}問</span>
            </div>
          </div>
        </div>
        <div class="grid2" style="margin-top:14px">
          <button class="btn primary" data-act="timer">${icon('timer', 'sm')}${timerRunning() ? 'タイマー動作中' : '30分タイマー'}</button>
          <button class="btn soft" data-act="log">${icon('edit', 'sm')}記録する</button>
        </div>
      </div>

      ${A && !A.finished ? `<button class="card tap section alert info" data-act="resume" style="width:100%;text-align:left">
        ${icon('play')}<div class="grow"><b>続きから再開</b><span class="small">${esc(getCert(A.cert)?.short || '')}：${esc(A.title)}（${A.idx + 1} / ${A.ids.length}問目）</span></div>${icon('right', 'sm')}</button>` : ''}

      ${noteCard(s)}
      ${shareCard(s)}

      ${nts.length ? `<div class="section">${nts.map((n) => `
        <a class="alert compact ${n.kind === 'exam' ? 'info' : ''}" href="#/cert/${n.cert.id}/exam" style="text-decoration:none">
          ${icon(n.kind === 'exam' ? 'calendar' : n.kind === 'expiry' ? 'rotate' : 'alert')}
          <div class="grow"><b>${esc(n.cert.short)}</b><div class="small" style="color:var(--ink-2)">${esc(n.label)}</div></div>
          <div class="left">${n.left < 0 ? `<span class="days">${-n.left}日</span>過ぎています` : n.left === 0 ? '<span class="days">今日</span>' : `あと<span class="days">${n.left}日</span>`}${fmtDate(n.date, false)}</div>
        </a>`).join('')}</div>` : ''}

      ${nx ? `<div class="section">
        <div class="section-h"><h2>次にやること</h2></div>
        <button class="mode hero-mode" data-next="${nx.c.id}" data-mode="${nx.mode}" style="width:100%">
          <span class="mi">${icon(nx.mode === 'due' ? 'repeat' : nx.mode === 'mock' ? 'target' : 'bolt', 'lg')}</span>
          <div class="grow"><b style="font-size:16px">${esc(nx.c.short)}：${esc(nx.title)}</b><span style="display:block;margin-top:2px">${esc(nx.desc)}</span></div>
          ${icon('right')}
        </button>
      </div>` : ''}

      <div class="section">
        <div class="section-h"><h2>資格</h2><a class="link" href="#/guide">おすすめの順番</a></div>
        <div class="col" style="gap:10px">
          ${certs.map((c, i) => certCard(c, i, stats[c.id], stats)).join('')}
        </div>
      </div>

      <a class="card tap section row" href="#/guide" style="text-decoration:none;color:inherit">
        <span class="lr-ic" style="width:40px;height:40px;border-radius:12px;background:var(--primary-soft);color:var(--primary);display:grid;place-items:center">${icon('book')}</span>
        <div class="grow"><b>はじめに：資格取得の学習ガイド</b><div class="small muted">なぜ資格を取るのか・勉強の進め方・守ること</div></div>${icon('right', 'sm')}
      </a>
      </div>`
    first = false
    animateIn(el)
  }

  function noteCard(s) {
    const n = (s.mentorNotes || []).find((x) => !x.read)
    if (!n) return ''
    return `<div class="card section mentor-msg">
      <div class="row between"><div class="eyebrow">${icon('message', 'xs')} ${esc(n.from || mentorName())}からのひとこと</div><span class="xsmall muted">${esc(new Date(n.t).getMonth() + 1 + '月' + new Date(n.t).getDate() + '日')}</span></div>
      <p style="margin:6px 0 10px;white-space:pre-wrap">${esc(n.msg)}</p>
      <button class="btn soft sm" data-act="readnote" data-t="${Number(n.t) || 0}">${icon('check', 'xs')}読んだ</button>
    </div>`
  }
  function shareCard(s) {
    const active = s.logs.length || s.sessions.length
    const last = s.shared && s.shared.at
    if (!active || (last && Date.now() - last < 6 * 86400000)) return ''
    const m = mentorName()
    return `<button class="card tap section row" data-act="share" style="width:100%;text-align:left">
      <span style="width:40px;height:40px;border-radius:12px;background:var(--primary-soft);color:var(--primary);display:grid;place-items:center;flex:none">${icon('share')}</span>
      <div class="grow"><b>${esc(m)}に今週の進み具合を送りましょう</b><div class="small muted">${last ? `前に送ったのは ${Math.floor((Date.now() - last) / 86400000)}日前` : 'リンクを送るだけで、資格ごとの進み具合や「聞きたいこと」を見てもらえます'}</div></div>${icon('right', 'sm')}
    </button>`
  }

  function certCard(c, i, st, all) {
    const [label, cls] = STATUS[st.status]
    const locked = c.prereq && all[c.prereq].status !== 'passed'
    const rateTxt = st.recentRate == null ? '—' : `${Math.round(st.recentRate * 100)}%`
    return `<a class="card tap cert-card" href="#/cert/${c.id}" style="text-decoration:none;color:inherit">
      <div style="position:relative">${certMark(c)}<span class="order-num" style="position:absolute;top:-6px;left:-6px;box-shadow:0 0 0 2px var(--surface)">${i + 1}</span></div>
      <div class="grow">
        <div class="row between" style="gap:8px"><span class="name ellipsis">${esc(c.short)}</span>
          <span class="row" style="gap:4px">${st.due ? `<span class="chip ng">${icon('repeat', 'xs')}${st.due}</span>` : ''}${st.ready && st.status !== 'passed' ? `<span class="chip ok">${icon('check', 'xs')}申込OK</span>` : ''}<span class="chip ${cls}">${label}</span></span></div>
        <div class="meta"><span>${esc(c.fee)}</span><span>${esc(c.format.split('・')[0])}</span>${locked ? `<span>${icon('lock', 'xs')} ${esc(getCert(c.prereq).short)}の合格後</span>` : ''}</div>
        <div style="margin-top:8px">${bar(st.mastery, st.mastery >= 0.75 ? 'ok' : '')}</div>
        <div class="meta" style="margin-top:6px"><span>習熟 ${Math.round(st.mastery * 100)}%</span><span>解いた ${st.seen}/${st.total}</span><span>直近の正答率 ${rateTxt}</span>${st.minutes ? `<span>${fmtMin(st.minutes)}</span>` : ''}</div>
      </div>
    </a>`
  }

  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act], [data-next]')
    if (!t) return
    if (t.dataset.next) return startQuiz({ cert: t.dataset.next, mode: t.dataset.mode })
    const act = t.dataset.act
    if (act === 'timer') openTimer()
    else if (act === 'log') openLogForm()
    else if (act === 'resume') location.hash = '#/quiz'
    else if (act === 'share') openShareSheet()
    else if (act === 'readnote') {
      const n = (store.get().mentorNotes || []).find((x) => String(x.t) === t.dataset.t)
      if (n) { n.read = true; store.commit(true) }
    }
  })
  const unsub = store.subscribe(() => draw())
  draw()
  return () => unsub()
}
