// 復習：期限の来た問題・間違えた問題・聞くことリスト
import { store } from '../store.js'
import { orderedCerts, cert as getCert } from '../data.js'
import { icon } from '../icons.js'
import { esc, today, fmtDate } from '../util.js'
import { animateIn, certMark, emptyState } from '../ui.js'
import { certStats, isDue } from '../srs.js'
import { startQuiz, REASONS } from './quiz.js'
import { openLogForm } from './log.js'
import { mentorName, go } from '../nav.js'

export async function render(el) {
  const draw = () => {
    const s = store.get()
    const d = today()
    const certs = orderedCerts()
    const rows = certs.map((c) => {
      const st = certStats(c.id)
      const prefix = c.id + ':'
      let marked = 0
      const reasons = { unknown: 0, misread: 0, unsure: 0 }
      for (const [id, r] of Object.entries(s.q)) {
        if (!id.startsWith(prefix)) continue
        if (r.mark) marked++
        if (r.lastOk === false && r.reason) reasons[r.reason] = (reasons[r.reason] || 0) + 1
      }
      const termDue = Object.entries(s.t).filter(([id, r]) => id.startsWith(prefix) && r.due && r.due <= d).length
      return { c, st, marked, reasons, termDue }
    })
    const active = rows.filter((r) => r.st.seen > 0 || r.termDue > 0)
    const totalDue = rows.reduce((a, r) => a + r.st.due, 0)
    const totalWrong = rows.reduce((a, r) => a + r.st.wrong, 0)
    const totalTerm = rows.reduce((a, r) => a + r.termDue, 0)
    const reasonsAll = REASONS.map((x) => ({ ...x, n: rows.reduce((a, r) => a + (r.reasons[x.id] || 0), 0) }))
    const asks = s.logs.filter((x) => x.ask && !x.comment)
    const m = mentorName()

    el.innerHTML = `
      <div class="topbar"><div class="title"></div></div>
      <div class="eyebrow">復習</div>
      <h1 class="big-title">忘れる前に、もう一度</h1>
      <p class="muted small" style="margin:4px 0 0">間違えた問題は翌日、正解した問題は 3日 → 1週間 → 2週間 → 1か月 と、間をあけて出てきます。</p>

      <div class="grid3 section">
        <div class="stat" style="background:var(--surface);border:1px solid var(--line)"><b style="color:var(--primary)">${totalDue}</b><span>今日の復習</span></div>
        <div class="stat" style="background:var(--surface);border:1px solid var(--line)"><b style="color:var(--ng)">${totalWrong}</b><span>間違えた問題</span></div>
        <div class="stat" style="background:var(--surface);border:1px solid var(--line)"><b style="color:var(--warn)">${totalTerm}</b><span>用語の復習</span></div>
      </div>

      <div class="section">
        <div class="section-h"><h2>資格ごと</h2></div>
        ${active.length ? `<div class="col" style="gap:10px">${active.map(({ c, st, marked, termDue }) => `
          <div class="card">
            <div class="row" style="gap:12px">${certMark(c)}<div class="grow"><b>${esc(c.short)}</b><div class="small muted">復習 ${st.due}問 ・ 間違い ${st.wrong}問 ・ 迷った ${st.unsure}問${marked ? ` ・ 印 ${marked}問` : ''}</div></div></div>
            <div class="chips" style="margin-top:12px">
              ${st.due ? `<button class="btn primary sm" data-q="due" data-c="${c.id}">${icon('repeat', 'xs')}復習 ${Math.min(st.due, s.profile.quizSize)}問</button>` : ''}
              ${st.wrong ? `<button class="btn soft sm" data-q="wrong" data-c="${c.id}">間違えた問題</button>` : ''}
              ${st.unsure ? `<button class="btn soft sm" data-q="unsure" data-c="${c.id}">迷った問題</button>` : ''}
              ${marked ? `<button class="btn soft sm" data-q="mark" data-c="${c.id}">印の問題</button>` : ''}
              ${termDue ? `<button class="btn ghost sm" data-flash="${c.id}">${icon('cards', 'xs')}用語 ${termDue}語</button>` : ''}
              ${!st.due && !st.wrong && !st.unsure && !marked && !termDue ? `<span class="chip ok">${icon('check', 'xs')}今日の復習はありません</span>` : ''}
            </div>
          </div>`).join('')}</div>` : `<div class="card">${emptyState('repeat', 'まだ解いた問題がありません。<br>ホームから資格を選んで、問題を解いてみましょう。')}<a class="btn soft block" href="#/home">ホームへ</a></div>`}
      </div>

      <div class="card section">
        <div class="section-h"><h2>間違いの理由</h2></div>
        <div class="grid3">${reasonsAll.map((r) => `<div class="stat"><b>${r.n}</b><span>${r.label}</span></div>`).join('')}</div>
        <div class="col" style="gap:6px;margin-top:12px">
          ${REASONS.map((r) => `<div class="small"><b>${r.label}</b><span class="muted"> → ${r.hint}</span></div>`).join('')}
        </div>
      </div>

      <div class="card section">
        <div class="section-h"><h2>${esc(m)}に聞くこと</h2><span class="small muted">${asks.length}件</span></div>
        ${asks.length ? asks.slice(0, 30).map((x) => `
          <button class="list-row" data-log="${x.id}">
            <span class="dot" style="background:${getCert(x.cert)?.color || 'var(--faint)'}"></span>
            <div class="grow"><div class="small">${esc(x.ask)}</div><div class="xsmall muted">${fmtDate(x.date)} ・ ${esc(getCert(x.cert)?.short || '')}</div></div>
            ${icon('edit', 'sm chev')}
          </button>`).join('') : `<p class="small muted" style="margin:0">学習ログの「分からなかったこと・聞きたいこと」に書いた内容が、ここに集まります。答えを聞いたら、ログの「コメント」に書くとリストから消えます。</p>`}
      </div>`
    animateIn(el)
  }

  el.addEventListener('click', (e) => {
    const t = e.target.closest('button')
    if (!t) return
    if (t.dataset.q) return startQuiz({ cert: t.dataset.c, mode: t.dataset.q })
    if (t.dataset.flash) return go(`#/flash/${t.dataset.flash}?set=due`)
    if (t.dataset.log) return openLogForm({}, t.dataset.log)
  })
  const unsub = store.subscribe(() => draw())
  draw()
  return () => unsub()
}
