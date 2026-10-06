// 資格ごとのページ：学習／用語／ガイド／受験
import { store } from '../store.js'
import { cert as getCert, questions, terms as loadTerms, guide as loadGuide, summaries as loadSummaries, extrasOf } from '../data.js'
import { icon } from '../icons.js'
import { esc, fmtDate, fmtMin, pct, daysBetween, today } from '../util.js'
import { ring, bar, animateIn, certMark, toast, emptyState, loadError } from '../ui.js'
import { certStats, catStats, READY_RATE } from '../srs.js'
import { startQuiz, REASONS } from './quiz.js'
import { openExamForm } from './log.js'
import { go, mentorName } from '../nav.js'
import { examPlan } from '../plan.js'
import { planCardHTML, planPromptHTML } from './plancard.js'
import { summaryBodyHTML, summarySpeech, openSummarySheet } from './summary.js'
import { drillTypes } from './drill.js'
import { isNewId, scopeSetting, newScopeOn, setScope } from '../scope.js'
import { openCalendarSheet } from './calsheet.js'
import { canSpeak, speak, stopSpeak, isSpeaking } from '../speech.js'
import { getBook, lessonStats, nextLesson, isRead } from '../lessons.js'

const TABS = [['study', '学習'], ['book', '教科書'], ['terms', '用語'], ['guide', 'ガイド'], ['exam', '受験']]
let termQuery = ''
let termCat = ''
let termCertId = ''
const termMatch = (t, q) => (!termCat || (termCat === '_dict' ? t.dict : termCat === '_base' ? !t.cat && !t.dict : t.cat === termCat)) && (!q || (t.term + ' ' + (t.reading || '') + ' ' + t.meaning + ' ' + (t.example || '')).toLowerCase().includes(q))

export function guideHTML(html) {
  return html.replaceAll('{{mentor}}', esc(mentorName()))
}

export async function render(el, p) {
  const id = p.parts[0]
  const c = getCert(id)
  if (!c) { go('#/home', { replace: true }); return }
  // 以前の「要点」タブ（#/cert/…/sum）は、教科書タブの中に入れた
  let tab = p.parts[1] === 'sum' ? 'book' : TABS.some((t) => t[0] === p.parts[1]) ? p.parts[1] : 'study'
  // 別の資格を開いたら、用語の検索と分野のしぼり込みを戻す
  if (termCertId !== id) { termQuery = ''; termCat = ''; termCertId = id }
  let qs, ts, gd, sm, bk
  try {
    ;[qs, ts, gd, sm, bk] = await Promise.all([questions(id), loadTerms(id), loadGuide(c.guide).catch(() => null), loadSummaries(id).catch(() => null), getBook(id)])
  } catch (e) {
    loadError(el, () => render(el, p))
    return
  }
  store.get().profile.focusCert = id
  store.commit()

  let tabAnim = true
  // 教科書タブで開いている章（描き直しても閉じないように覚えておく）
  let openChapters = null
  const draw = () => {
    const s = store.get()
    const anim = tabAnim
    tabAnim = false
    el.innerHTML = `
      <div class="topbar glass">
        <a class="icon-btn" href="#/home" aria-label="ホームへ戻る">${icon('left')}</a>
        <div class="title">${esc(c.short)}</div>
        <a class="icon-btn" href="${esc(c.official)}" target="_blank" rel="noopener" aria-label="公式ページを開く">${icon('external', 'sm')}</a>
      </div>
      <div class="cert-head">${certMark(c, true)}<div class="grow"><div class="eyebrow">${esc(c.org)}</div><h1>${esc(c.name)}</h1></div></div>
      <div class="seg" role="tablist">${TABS.map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div class="section ${anim ? 'page-enter' : ''}" id="tb">${body(s)}</div>`
    animateIn(el)
  }

  function body(s) {
    if (tab === 'study') return studyTab(s)
    if (tab === 'book') return bookTab(s)
    if (tab === 'terms') return termsTab(s)
    if (tab === 'guide') return guideTab()
    return examTab(s)
  }

  // ---- 学習 ----
  function studyTab(s) {
    const st = certStats(id)
    const cs = catStats(id, qs)
    const wrong = qs.filter((q) => s.q[q.id] && s.q[q.id].lastOk === false).length
    const unsure = qs.filter((q) => s.q[q.id] && s.q[q.id].unsure && s.q[q.id].lastOk !== false).length
    const marked = qs.filter((q) => s.q[q.id] && s.q[q.id].mark).length
    const unseen = qs.filter((q) => !(s.q[q.id] && s.q[q.id].seen)).length
    const reasons = Object.fromEntries(REASONS.map((r) => [r.id, qs.filter((q) => s.q[q.id] && s.q[q.id].lastOk === false && s.q[q.id].reason === r.id).length]))
    const A = s.active
    const covOk = st.coverage >= 0.6
    const lock = c.prereq && certStats(c.prereq).status !== 'passed'
    if (!qs.length) return `<div class="card">${emptyState('info', 'この資格の問題は準備中です。<br>「ガイド」と「受験」のタブは使えます。')}</div>`
    return `
      ${lock ? `<div class="alert info">${icon('lock')}<div><b>${esc(getCert(c.prereq).short)} に合格してから受けられます</b><span class="small">勉強は先に始めてもかまいません。</span></div></div>` : ''}
      ${A && !A.finished && A.cert === id ? `<button class="alert info section" data-act="resume" style="width:100%;text-align:left">${icon('play')}<div class="grow"><b>続きから再開</b><span class="small">${esc(A.title)}（${A.idx + 1} / ${A.ids.length}問目）</span></div>${icon('right', 'sm')}</button>` : ''}
      <div class="card pad-lg ${lock || (A && !A.finished && A.cert === id) ? 'section' : ''}">
        <div class="hero">
          ${ring(st.mastery, { size: 108, stroke: 11, label: `${Math.round(st.mastery * 100)}<small style="font-size:12px">%</small>`, sub: '習熟度' })}
          <div class="grow">
            <div class="kv" style="grid-template-columns:auto 1fr;font-size:14px;gap:4px 10px">
              <dt>解いた問題</dt><dd><b>${st.seen}</b> / ${st.total}問</dd>
              <dt>直近の正答率</dt><dd><b>${st.recentRate == null ? '—' : Math.round(st.recentRate * 100) + '%'}</b></dd>
              <dt>学習時間</dt><dd><b>${fmtMin(st.minutes)}</b> <span class="muted small">（目安 ${c.hours[0]}〜${c.hours[1]}時間）</span></dd>
            </div>
          </div>
        </div>
        <div class="ready ${st.ready ? 'go' : ''}" style="margin-top:14px">
          ${icon(st.ready ? 'check' : 'target')}
          <div class="grow">${st.ready ? `<b>受験申込みの目安に届きました</b><div class="small">${esc(mentorName())}に相談して、申込みに進みましょう。</div>` : `<b>受験申込みの目安：安定して8割</b>
            <div class="small">${covOk ? icon('check', 'xs') : '・'} 全体の6割以上の問題に挑戦（いま ${Math.round(st.coverage * 100)}%）<br>
            ${st.stable || st.mockOk ? icon('check', 'xs') : '・'} 直近3回（各10問以上）がすべて8割以上、または模擬試験で8割以上</div>`}</div>
        </div>
      </div>

      ${planSection()}

      <div class="section mode-grid">
        <button class="mode hero-mode" data-q="smart"><span class="mi">${icon('bolt', 'lg')}</span><div class="grow"><b>おまかせ学習</b><span style="display:block">復習の時期が来た問題と、苦手な分野の問題を ${s.profile.quizSize}問</span></div>${icon('right')}</button>
        <button class="mode" data-q="due" ${st.due ? '' : 'disabled style="opacity:.55"'}><span class="count">${st.due}</span><span class="mi">${icon('repeat')}</span><b>今日の復習</b><span>忘れかけた頃に、もう一度</span></button>
        <button class="mode" data-q="mock"><span class="mi">${icon('target')}</span><b>模擬試験</b><span>${qs.length >= c.mock.count ? `${c.mock.count}問・${c.mock.minutes}分` : `${qs.length}問・${Math.max(1, Math.round(c.mock.minutes * qs.length / c.mock.count))}分（問題を追加中）`}</span></button>
        <button class="mode" data-q="wrong" ${wrong ? '' : 'disabled style="opacity:.55"'}><span class="count">${wrong}</span><span class="mi" style="background:var(--ng-soft);color:var(--ng)">${icon('x')}</span><b>間違えた問題</b><span>最後に間違えた問題だけ</span></button>
        <button class="mode" data-q="unsure" ${unsure ? '' : 'disabled style="opacity:.55"'}><span class="count">${unsure}</span><span class="mi" style="background:var(--warn-soft);color:var(--warn)">${icon('help')}</span><b>迷った問題</b><span>合っていても迷ったもの</span></button>
        <button class="mode" data-q="new" ${unseen ? '' : 'disabled style="opacity:.55"'}><span class="count">${unseen}</span><span class="mi">${icon('sparkles')}</span><b>まだ解いていない</b><span>新しい問題から</span></button>
        <button class="mode" data-q="mark" ${marked ? '' : 'disabled style="opacity:.55"'}><span class="count">${marked}</span><span class="mi">${icon('flag')}</span><b>印をつけた問題</b><span>あとで見直す用</span></button>
        <button class="mode" data-flash="1"><span class="count">${ts.length}</span><span class="mi">${icon('cards')}</span><b>用語カード</b><span>意味を1行で言えるか</span></button>
        ${drillTypes(id).length ? `<button class="mode" data-act="drill"><span class="mi">${icon('calc')}</span><b>計算ドリル</b><span>数字を変えて何度でも</span></button>` : ''}
        ${bk ? `<button class="mode" data-tab="book"><span class="count">${lessonStats(id).read}/${lessonStats(id).total}</span><span class="mi">${icon('book')}</span><b>教科書</b><span>1回3〜5分で読んで理解する</span></button>` : ''}
      </div>
      <p class="xsmall muted" style="margin:8px 2px 0">${icon('info', 'xs')} ${esc(c.mock.note)}</p>

      ${pastCard(s)}
      ${newScopeCard(s)}

      <div class="card section">
        <div class="section-h"><h2>分野ごとの習熟度</h2><span class="small muted">タップで分野別に解く</span></div>
        ${c.categories.map((cat) => { const o = cs[cat.id] || { total: 0, seen: 0, mastery: 0, rate: null }; if (!o.total) return ''; return `
          <div class="cat-row" data-cat="${cat.id}" role="button" tabindex="0">
            <span class="nm">${esc(cat.name)}</span><span class="pct">${Math.round(o.mastery * 100)}%</span>
            ${bar(o.mastery, o.mastery >= 0.75 ? 'ok' : o.mastery >= 0.4 ? '' : o.seen ? 'warn' : '')}
            <span class="sub">${o.seen}/${o.total}問に挑戦${o.rate != null ? ` ・ 正答率 ${Math.round(o.rate * 100)}%` : ''}</span>
          </div>` }).join('')}
      </div>

      ${planCard(s)}

      <div class="card section">
        <div class="section-h"><h2>間違いの理由</h2></div>
        <div class="grid3">${REASONS.map((r) => `<div class="stat"><b>${reasons[r.id]}</b><span>${r.label}</span></div>`).join('')}</div>
        <p class="small muted" style="margin:10px 0 0">「知らなかった」だけ、教材（ガイドの用語や公式の教材）に戻ります。「読み違えた」「迷って外した」は、問題文と選択肢の違いを一言でメモすれば十分です。</p>
      </div>`
  }

  // ---- 受験日までの計画 ----
  function planSection() {
    const st = certStats(id)
    if (st.status === 'passed') return ''
    const pl = examPlan(id)
    return `<div class="section">${pl ? planCardHTML(pl) : planPromptHTML(c)}</div>`
  }

  // ---- 公式の過去問（IPA 公開問題） ----
  function pastCard(s) {
    const sets = extrasOf(id).filter((x) => x.kind === 'past')
    if (!sets.length) return ''
    return `<div class="card section">
      <div class="section-h"><h2>${icon('medal', 'sm')} 公式の過去問（IPA）</h2></div>
      <p class="xsmall muted" style="margin:-4px 0 4px">IPA が公開している本物の試験問題です。問題文は原文どおりで、解説はこのアプリが作りました。</p>
      ${sets.map((x) => {
        const list = qs.filter((q) => q.set === x.set)
        const seen = list.filter((q) => s.q[q.id] && s.q[q.id].seen).length
        const ok = list.filter((q) => s.q[q.id] && s.q[q.id].lastOk).length
        const last = s.sessions.find((y) => y.cert === id && y.mode === 'pastexam' && y.set === x.set)
        return `<div class="past-set">
          <div class="row between" style="gap:8px"><b>${esc(x.title)}</b><span class="small muted">${list.length}問</span></div>
          <div style="margin-top:6px">${bar(list.length ? seen / list.length : 0, seen && ok / Math.max(1, seen) >= 0.6 ? 'ok' : '')}</div>
          <div class="xsmall muted" style="margin-top:4px">解いた ${seen}/${list.length}問${seen ? ` ・ 正解 ${ok}問` : ''}${last ? ` ・ 前回の本番形式 ${last.correct}/${last.total}問（${Math.round(last.correct / last.total * 100)}%）` : ''}</div>
          <div class="btns">
            <button class="btn soft sm" data-past="${x.set}" data-pmode="past">${icon('play', 'xs')}${seen && seen < list.length ? '続きから' : ''}${s.profile.quizSize}問</button>
            <button class="btn ghost sm" data-past="${x.set}" data-pmode="pastexam">${icon('clock', 'xs')}本番形式（${x.minutes}分）</button>
          </div>
        </div>`
      }).join('')}
      <p class="xsmall muted" style="margin:8px 0 0">出典：IPA（独立行政法人 情報処理推進機構）公開問題。</p>
    </div>`
  }

  // ---- 2027年からの新しい範囲 ----
  function newScopeCard(s) {
    const list = qs.filter((q) => isNewId(q.id))
    if (!list.length) return ''
    const seen = list.filter((q) => s.q[q.id] && s.q[q.id].seen).length
    const v = scopeSetting(id)
    const on = newScopeOn(id)
    return `<div class="card section">
      <div class="section-h"><h2>${icon('sparkles', 'sm')} 2027年からの新しい範囲</h2><span class="small muted">${list.length}問</span></div>
      <p class="small muted" style="margin-top:-4px">IPA が公開したシラバス案（Ver.0.1）で新しく加わる内容の練習問題です${list.some((q) => /:s27-/.test(q.id)) ? '（IPA のサンプル問題をふくむ）' : ''}。シラバス案は、これから変わることがあります。</p>
      <div style="margin-top:4px">${bar(seen / list.length)}</div>
      <div class="xsmall muted" style="margin:4px 0 10px">解いた ${seen}/${list.length}問</div>
      <button class="btn soft block" data-q="newscope">${icon('play', 'sm')}新しい範囲を解く</button>
      <div class="field" style="margin:12px 0 0"><span class="lab">おまかせ学習・今日の復習に入れるか</span>
        <div class="stepper">${[['auto', '受験日で決める'], ['on', '入れる'], ['off', '入れない']].map(([k, l]) => `<button data-scope="${k}" class="${v === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <span class="hint">いまは<b>${on ? '入れています' : '入れていません'}</b>。「受験日で決める」は、受験日が2027年以降なら入れます（受験日がなければ、今の試験が終わる2026年12月28日から）。</span></div>
    </div>`
  }

  // ---- 教科書 ----
  function bookTab(s) {
    if (!bk) return `<div class="card">${emptyState('book', '教科書を読み込めませんでした。電波のよいところで開き直してください。')}</div>`
    const ls = lessonStats(id)
    const nx = nextLesson(bk)
    const chs = bk.chapters.filter((ch) => c.catById[ch.cat])
    return `
      <div class="card pad-lg">
        <div class="row between"><b>読んだ回 ${ls.read} / ${ls.total}</b><span class="small muted">1回 3〜5分</span></div>
        <div style="margin-top:8px">${bar(ls.total ? ls.read / ls.total : 0, 'ok')}</div>
        ${nx ? `<button class="btn primary block lg" style="margin-top:14px" data-lesson="${esc(nx.id)}">${icon('book', 'sm')}<span class="ellipsis">${ls.read ? '続きから読む' : '第1回から読む'}：${esc(nx.title)}</span></button>` : `<p class="small" style="margin:12px 0 0">${icon('check', 'xs')} すべての回を読みました。問題で、覚えたことを確かめましょう。</p>`}
        <p class="xsmall muted" style="margin:10px 0 0">読んだら、最後にある「確認問題」で理解を確かめます。分からない言葉は「用語」タブで探せます。</p>
      </div>
      ${chs.map((ch) => {
        const cat = c.catById[ch.cat]
        const rd = ch.lessons.filter((l) => isRead(l.id)).length
        const open = openChapters ? openChapters.has(ch.cat) : !!(nx && nx.cat === ch.cat)
        return `<details class="card section book-ch" data-ch="${ch.cat}" ${open ? 'open' : ''}>
          <summary><div class="grow"><b>${esc(cat.name)}</b><div class="xsmall muted">${rd} / ${ch.lessons.length}回 ${rd === ch.lessons.length ? '・ 読み終えた' : ''}</div></div>${icon('right', 'sm chev')}</summary>
          ${ch.intro ? `<p class="small muted" style="margin:0 0 6px">${esc(ch.intro)}</p>` : ''}
          ${ch.lessons.map((l, i) => `<button class="list-row lesson-row" data-lesson="${esc(l.id)}">
            <span class="lr-ic ${isRead(l.id) ? 'done' : ''}">${isRead(l.id) ? icon('check', 'sm') : `<b>${i + 1}</b>`}</span>
            <div class="grow"><b class="small">${esc(l.title)}</b><div class="xsmall muted">約${l.minutes || 4}分${(l.check || []).length ? ` ・ 確認問題 ${l.check.length}問` : ''}</div></div>${icon('right', 'sm chev')}
          </button>`).join('')}
          <div class="row" style="gap:8px;margin-top:10px">
            ${sm && sm.cats && sm.cats[ch.cat] ? `<button class="btn soft sm" data-sumcat="${ch.cat}">${icon('list', 'xs')}要点まとめ</button>` : ''}
            <button class="btn ghost sm" data-cat="${ch.cat}">${icon('play', 'xs')}この章の問題を解く</button>
          </div>
        </details>`
      }).join('')}
      ${(c.materials || []).length ? `<div class="card section">
        <div class="section-h"><h2 style="font-size:16px">${icon('external', 'sm')} 公式の教材でくわしく</h2></div>
        ${c.materials.map((x) => `<a class="list-row" href="${esc(x.url)}" target="_blank" rel="noopener"><div class="grow"><b class="small">${esc(x.title)}</b>${x.note ? `<div class="xsmall muted">${esc(x.note)}</div>` : ''}</div>${icon('external', 'xs')}</a>`).join('')}
      </div>` : ''}
      <p class="xsmall muted" style="margin:10px 2px">この教科書は、アプリの問題・用語・ガイド（事実確認ずみ）をもとに書き、別に点検したものです。試験の決まりや料金などは変わることがあるので、公式の情報も確かめてください。</p>`
  }

  // ---- 要点（教科書タブから開く） ----
  function sumTab() {
    if (!sm) return `<div class="card">${emptyState('list', '要点まとめを読み込めませんでした。電波のよいところで開き直してください。')}</div>`
    const cats = c.categories.filter((cat) => sm.cats && sm.cats[cat.id])
    return `
      <p class="small muted" style="margin:0 2px 10px">分野ごとに、覚えておきたいことを1画面にまとめました。問題を解く前の確認や、まちがえたあとの見直しに使います。</p>
      <div class="card">${cats.map((cat, i) => `<details class="sum-cat" ${i === 0 ? 'open' : ''}><summary><b>${esc(cat.name)}</b>${icon('right', 'sm chev')}</summary>
        ${summaryBodyHTML(sm.cats[cat.id])}
        <div class="row" style="gap:8px;margin:-6px 0 14px">
          <button class="btn soft sm" data-cat="${cat.id}">${icon('play', 'xs')}この分野を解く</button>
          ${canSpeak() ? `<button class="btn ghost sm ${isSpeaking('sum-' + cat.id) ? 'on' : ''}" data-speaksum="${cat.id}">${icon('volume', 'xs')}読み上げる</button>` : ''}
        </div>
      </details>`).join('')}</div>
      <p class="xsmall muted" style="margin:10px 2px">この要点は、アプリの問題と用語（事実確認ずみ）をもとにまとめ、別に点検したものです。試験の決まりや料金などは変わることがあるので、公式の情報も確かめてください。</p>`
  }

  function planCard(s) {
    const plan = studyPlan()
    if (!plan || !plan.rows.length) return ''
    const checks = s.checks[id] || {}
    const done = plan.rows.filter((_, i) => checks['plan' + i]).length
    return `<div class="card section">
      <div class="section-h"><h2>学習計画</h2><span class="small muted">${done} / ${plan.rows.length}</span></div>
      <p class="xsmall muted" style="margin:-4px 0 8px">${esc(plan.title)}（ガイドの例）。終わったらチェックします。</p>
      ${bar(done / plan.rows.length, 'ok')}
      <div style="margin-top:4px">${plan.rows.map((r, i) => `<div class="check-item ${checks['plan' + i] ? 'on' : ''}" data-chk="plan${i}" role="checkbox" aria-checked="${!!checks['plan' + i]}" tabindex="0"><span class="check-box">${icon('check', 'xs')}</span><span class="txt"><b>${esc(r[0])}</b>　${esc(r[1])}</span></div>`).join('')}</div>
    </div>`
  }

  // ---- 用語 ----
  function termsTab(s) {
    const q = termQuery.trim().toLowerCase()
    const list = ts.filter((t) => termMatch(t, q))
    const cats = c.categories.filter((cat) => ts.some((t) => t.cat === cat.id))
    const known = ts.filter((t) => s.t[t.id] && s.t[t.id].box >= 3).length
    return `
      <div class="card">
        <div class="row between"><div><b>${ts.length}語</b><span class="muted small"> ・ 覚えた ${known}語</span></div><span class="small muted">覚えた＝3回以上「言えた」</span></div>
        ${ts.some((t) => t.dict) ? `<p class="xsmall muted" style="margin:6px 0 0">うち ${ts.filter((t) => t.dict).length}語は、公式の出題範囲（シラバスなど）にある用語を、1〜2行で説明した「用語辞典」です。</p>` : ''}
        <div style="margin-top:8px">${bar(ts.length ? known / ts.length : 0, 'ok')}</div>
        <div class="grid2" style="margin-top:14px">
          <button class="btn primary" data-flash="due">${icon('cards', 'sm')}カードで覚える</button>
          <button class="btn soft" data-flash="all">${icon('shuffle', 'sm')}全部をシャッフル</button>
        </div>
      </div>
      <div class="section">
        <label class="search"><span class="sr-only">用語を探す</span>${icon('search', 'sm')}<input id="tq" type="search" placeholder="用語を探す" value="${esc(termQuery)}" enterkeyhint="search"></label>
        ${cats.length ? `<div class="hscroll" style="margin-top:10px"><button class="chip ${termCat ? '' : 'on'}" data-tcat="">すべて</button>${ts.some((t) => t.dict) ? `<button class="chip ${termCat === '_dict' ? 'on' : ''}" data-tcat="_dict">${icon('book', 'xs')}用語辞典（公式の範囲）</button>` : ''}<button class="chip ${termCat === '_base' ? 'on' : ''}" data-tcat="_base">基本の用語</button>${cats.map((cat) => `<button class="chip ${termCat === cat.id ? 'on' : ''}" data-tcat="${cat.id}">${esc(cat.name)}</button>`).join('')}</div>` : ''}
      </div>
      <div class="card section" id="tlist">${termList(list, s)}</div>`
  }
  function termList(list, s) {
    if (!list.length) return emptyState('search', '見つかりませんでした')
    return list.map((t) => { const r = s.t[t.id]; return `<div class="term-item">
      <div class="row between"><span class="t">${esc(t.term)}${t.reading ? `<span class="muted small" style="font-weight:600">（${esc(t.reading)}）</span>` : ''}</span><span class="row" style="gap:4px">${t.dict ? '<span class="chip">辞典</span>' : ''}${r ? `<span class="chip ${r.box >= 3 ? 'ok' : r.grade === 0 ? 'ng' : 'warn'}">${r.box >= 3 ? '覚えた' : r.grade === 0 ? '要復習' : 'あいまい'}</span>` : ''}</span></div>
      <div class="m">${esc(t.meaning)}</div>${t.example ? `<div class="e">例：${esc(t.example)}</div>` : ''}${t.src ? `<div class="e" style="font-size:11.5px">範囲：${esc(t.src)}</div>` : ''}</div>` }).join('')
  }

  // ---- ガイド ----
  function guideTab() {
    if (!gd) return `<div class="card">${emptyState('book', 'ガイドを読み込めませんでした')}</div>`
    return `
      ${gd.notice ? `<div class="guide-body" style="padding:0">${guideHTML(gd.notice)}</div>` : ''}
      <div class="card">
        <p class="small muted" style="margin:0 0 4px">${esc(gd.lead)}</p>
        ${gd.sections.map((sec, i) => `<details class="guide-sec" ${i === 0 ? 'open' : ''}><summary><span>${esc(sec.title)}</span>${icon('right', 'sm chev')}</summary><div class="guide-body">${guideHTML(sec.html)}</div></details>`).join('')}
      </div>
      <p class="xsmall muted" style="margin:10px 2px">この内容は ${esc(fmtDate('2026-09-20', false))}（2026年）に公式ページで確認したものです。試験の決まり・日程・画面は変わることがあります。申込みの前に、公式ページを必ず確認してください。</p>`
  }

  // ---- ガイドの学習計画（表）をチェックリストにする ----
  function studyPlan() {
    if (!gd) return null
    const sec = gd.sections.find((x) => x.title.includes('勉強の進め方'))
    if (!sec) return null
    const div = document.createElement('div')
    div.innerHTML = sec.html
    const h = [...div.querySelectorAll('h3')].find((x) => x.textContent.includes('1回30分'))
    if (!h) return null
    let el2 = h.nextElementSibling
    while (el2 && !el2.querySelector('table') && el2.tagName !== 'TABLE') el2 = el2.nextElementSibling
    const table = el2 && (el2.tagName === 'TABLE' ? el2 : el2.querySelector('table'))
    if (!table) return null
    const rows = [...table.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent.replace(/\s+/g, ' ').trim()))
      .filter((r) => r.length >= 2 && !/^合計/.test(r[0]))
    return { title: h.textContent.trim(), rows }
  }

  // ---- 受験 ----
  function dayChecklist() {
    if (!gd) return []
    const sec = gd.sections.find((x) => x.title.includes('当日'))
    if (!sec) return []
    const div = document.createElement('div')
    div.innerHTML = sec.html
    return [...div.querySelectorAll('li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean)
  }
  function examTab(s) {
    const e = s.exams[id] || {}
    const checks = s.checks[id] || {}
    const items = dayChecklist()
    const done = items.filter((_, i) => checks['day' + i]).length
    const d = today()
    return `
      ${(c.deadlines || []).filter((x) => x.date >= d).map((x) => `<div class="alert">${icon('alert')}<div><b>${esc(x.label)}</b><span class="small">${fmtDate(x.date)} ・ あと <span class="days">${daysBetween(d, x.date)}</span> 日</span></div></div>`).join('')}
      <div class="card ${(c.deadlines || []).some((x) => x.date >= d) ? 'section' : ''}">
        <div class="section-h"><h2>試験の基本</h2></div>
        <dl class="kv" style="margin:0">
          <dt>費用</dt><dd>${esc(c.fee)}</dd>
          <dt>形式</dt><dd>${esc(c.format)}</dd>
          <dt>合格ライン</dt><dd>${esc(c.passLine)}</dd>
          <dt>有効期間</dt><dd>${esc(c.validity)}</dd>
          <dt>合格率</dt><dd>${esc(c.officialPassRate)}</dd>
          <dt>勉強時間の目安</dt><dd>${c.hours[0]}〜${c.hours[1]}時間 <span class="muted small">（公式の数字ではありません）</span></dd>
          <dt>不合格のとき</dt><dd>${esc(c.retake)}</dd>
        </dl>
        <a class="btn ghost block" style="margin-top:14px" href="${esc(c.official)}" target="_blank" rel="noopener">${icon('external', 'sm')}公式ページを開く</a>
      </div>

      <div class="card section">
        <div class="section-h"><h2>受験の予定と結果</h2><button class="link" data-act="exam" style="color:var(--primary);font-weight:700;font-size:14px">${e.date || e.result ? '直す' : '書く'}</button></div>
        ${e.date || e.result || e.applied ? `<dl class="kv" style="margin:0">
          ${e.applied ? `<dt>申込み</dt><dd>${fmtDate(e.applied)}</dd>` : ''}
          ${e.date ? `<dt>受験日</dt><dd>${fmtDate(e.date)}${e.date >= d && !e.result ? ` <span class="chip warn">あと${daysBetween(d, e.date)}日</span>` : ''}</dd>` : ''}
          ${e.result ? `<dt>結果</dt><dd><span class="chip ${e.result === '合格' ? 'ok' : 'ng'}">${esc(e.result)}</span> ${esc(e.score || '')}</dd>` : ''}
          ${e.expiry ? `<dt>有効期限</dt><dd>${fmtDate(e.expiry)}</dd>` : ''}
          ${e.proof ? `<dt>証明</dt><dd>${esc(e.proof)}</dd>` : ''}
          ${e.memo ? `<dt>メモ</dt><dd>${esc(e.memo)}</dd>` : ''}
        </dl>` : `<p class="muted small" style="margin:0">申し込んだら、受験日を書いておきましょう。ホームに残りの日数が出ます。</p>`}
        <button class="btn soft block" style="margin-top:12px" data-act="exam">${icon('calendar', 'sm')}${e.date || e.result ? '予定・結果を直す' : '予定・結果を書く'}</button>
        ${e.date && e.date >= d && !e.result ? `<button class="btn ghost block" style="margin-top:8px" data-act="calendar">${icon('calendar', 'sm')}カレンダーに入れる</button>` : ''}
      </div>

      ${items.length ? `<div class="card section">
        <div class="section-h"><h2>当日のチェックリスト</h2><span class="small muted">${done} / ${items.length}</span></div>
        ${bar(done / items.length, 'ok')}
        <div style="margin-top:6px">${items.map((t, i) => `<div class="check-item ${checks['day' + i] ? 'on' : ''}" data-chk="day${i}" role="checkbox" aria-checked="${!!checks['day' + i]}" tabindex="0"><span class="check-box">${icon('check', 'xs')}</span><span class="txt">${esc(t)}</span></div>`).join('')}</div>
        ${done ? `<button class="btn ghost sm" style="margin-top:10px" data-act="resetchk">チェックを外す</button>` : ''}
      </div>` : ''}`
  }

  // タブを切りかえたら、新しいタブの先頭が見えるようにする
  function toTabTop(y0) {
    const seg = el.querySelector('.seg')
    if (!seg) return
    const top = seg.getBoundingClientRect().top + window.scrollY - 60
    window.scrollTo(0, Math.min(y0, Math.max(0, top)))
  }

  // ---- 操作 ----
  el.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-cat], [data-chk], a')
    if (!t) return
    if (t.dataset.tab) {
      tab = t.dataset.tab
      history.replaceState(null, '', `#/cert/${id}/${tab}`)
      tabAnim = true
      const y0 = window.scrollY
      draw()
      toTabTop(y0)
      return
    }
    if (t.dataset.q) {
      if (t.disabled) return
      return startQuiz({ cert: id, mode: t.dataset.q })
    }
    if (t.dataset.cat) return startQuiz({ cert: id, mode: 'cat', cat: t.dataset.cat })
    if (t.dataset.past) return startQuiz({ cert: id, mode: t.dataset.pmode, set: t.dataset.past })
    if (t.dataset.scope) { setScope(id, t.dataset.scope); toast(newScopeOn(id) ? '新しい範囲を、ふだんの出題に入れます' : '新しい範囲は、ふだんの出題に入れません'); return }
    if (t.dataset.lesson) return go(`#/lesson/${id}/${t.dataset.lesson}`)
    if (t.dataset.sumcat) return openSummarySheet(id, t.dataset.sumcat, sm)
    if (t.dataset.speaksum) {
      const key = 'sum-' + t.dataset.speaksum
      if (isSpeaking(key)) { stopSpeak(); t.classList.remove('on'); return }
      speak(summarySpeech(sm.cats[t.dataset.speaksum]), { key, onend: () => t.classList.remove('on') })
      t.classList.add('on')
      return
    }
    if (t.dataset.flash) return go(`#/flash/${id}?set=${t.dataset.flash === '1' ? 'due' : t.dataset.flash}${termCat && t.dataset.flash !== '1' ? `&cat=${termCat}` : ''}`)
    if (t.dataset.tcat != null) { termCat = t.dataset.tcat; draw(); return }
    if (t.dataset.chk) { store.toggleCheck(id, t.dataset.chk); return }
    const act = t.dataset.act
    if (act === 'planq') return startQuiz({ cert: id, mode: 'smart' })
    if (act === 'drill') return go(`#/drill/${id}`)
    if (act === 'calendar') return openCalendarSheet()
    if (act === 'exam') openExamForm(id)
    else if (act === 'resume') go('#/quiz')
    else if (act === 'resetchk') { const ch = store.get().checks[id] || {}; Object.keys(ch).filter((k) => k.startsWith('day')).forEach((k) => delete ch[k]); store.commit(true) }
  })
  el.addEventListener('toggle', (e) => {
    const d = e.target
    if (!d.matches || !d.matches('.book-ch')) return
    if (!openChapters) openChapters = new Set([...el.querySelectorAll('.book-ch[open]')].map((x) => x.dataset.ch))
    if (d.open) openChapters.add(d.dataset.ch)
    else openChapters.delete(d.dataset.ch)
  }, true)
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const t = e.target
    if (t.dataset && (t.dataset.cat || t.dataset.chk)) { e.preventDefault(); t.click() }
  })
  el.addEventListener('input', (e) => {
    if (e.target.id !== 'tq') return
    termQuery = e.target.value
    const q = termQuery.trim().toLowerCase()
    const list = ts.filter((t) => termMatch(t, q))
    el.querySelector('#tlist').innerHTML = termList(list, store.get())
  })
  const unsub = store.subscribe(() => {
    if (tab === 'guide') return
    const y = window.scrollY
    const active = document.activeElement && document.activeElement.id
    draw()
    window.scrollTo(0, y)
    if (active === 'tq') { const i = el.querySelector('#tq'); i && i.focus() }
  })
  draw()
  return () => { unsub(); stopSpeak() }
}
