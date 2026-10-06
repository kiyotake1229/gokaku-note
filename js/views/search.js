// 検索：すべての資格の問題・解説・用語から探す
import { store } from '../store.js'
import { orderedCerts, cert as getCert, questions, terms as loadTerms, catName } from '../data.js'
import { icon } from '../icons.js'
import { esc, richText, debounce } from '../util.js'
import { animateIn, sheet, emptyState, toast } from '../ui.js'
import { startQuiz, stemHTML, sourceHTML, noteHTML, KANA } from './quiz.js'
import { openFlagSheet } from './flagsheet.js'
import { getBook, flatLessons } from '../lessons.js'
import { go } from '../nav.js'

let lastQuery = ''
let lastCert = ''
const ALPHA = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
const KANA_CERTS = ['itpass', 'sg', 'jstqb', 'genai']

// 全角・半角、大文字・小文字、カタカナ・ひらがなの違いを気にせずに探す
const norm = (t) => String(t || '').normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60)).replace(/\s+/g, '')

function snippet(text, words, len = 70) {
  const t = String(text).replace(/```[\s\S]*?```/g, '［コード］').replace(/\s+/g, ' ')
  const nt = norm(t)
  let pos = -1
  for (const w of words) { pos = nt.indexOf(w); if (pos >= 0) break }
  // 正規化で長さがほぼ変わらない前提で、見つかった位置の前後を切り出す
  const start = Math.max(0, Math.min(t.length - len, pos - 20))
  let out = esc((start > 0 ? '…' : '') + t.slice(start, start + len) + (start + len < t.length ? '…' : ''))
  for (const w of words) {
    if (!w) continue
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    out = out.replace(re, (m) => `<mark>${m}</mark>`)
  }
  return out
}

export async function render(el, p) {
  let query = p.query.q != null ? p.query.q : lastQuery
  let certFilter = p.query.c != null ? p.query.c : lastCert
  const certs = orderedCerts()
  el.innerHTML = `
    <div class="topbar glass">
      <a class="icon-btn" href="#/home" aria-label="ホームへ">${icon('left')}</a>
      <div class="title">さがす</div>
    </div>
    <label class="search section" style="margin-top:6px"><span class="sr-only">問題・解説・用語をさがす</span>${icon('search', 'sm')}<input id="sq" type="search" placeholder="例：稼働率、ROAS、境界値" value="${esc(query)}" enterkeyhint="search" autocomplete="off"></label>
    <div class="hscroll" style="margin-top:10px"><button class="chip ${certFilter ? '' : 'on'}" data-c="">すべての資格</button>${certs.map((c) => `<button class="chip ${certFilter === c.id ? 'on' : ''}" data-c="${c.id}">${esc(c.short)}</button>`).join('')}</div>
    <div id="sr" class="section"><div class="skeleton" style="height:120px"></div></div>`
  const box = el.querySelector('#sr')
  let all
  try {
    const qs = await Promise.all(certs.map((c) => questions(c.id).catch(() => [])))
    const ts = await Promise.all(certs.map((c) => loadTerms(c.id).catch(() => [])))
    const bks = await Promise.all(certs.map((c) => getBook(c.id)))
    all = {
      q: qs.flat().map((q) => ({ q, cert: q.id.split(':')[0], hay: norm([q.stem, ...q.choices, q.explanation, q.source || ''].join(' ')) })),
      t: ts.flat().map((t) => ({ t, cert: t.id.split(':')[0], hay: norm([t.term, t.reading, t.meaning, t.example].join(' ')) })),
      l: bks.flatMap((bk, i) => flatLessons(bk).map((l) => ({ l, cert: certs[i].id, hay: norm([l.title, ...(l.goals || []), l.body].join(' ')) }))),
    }
  } catch (e) {
    box.innerHTML = emptyState('alert', 'データを読み込めませんでした')
    return
  }

  function run() {
    lastQuery = query
    lastCert = certFilter
    const words = String(query).split(/[\s\u3000,、]+/).map(norm).filter(Boolean)
    if (!words.length) {
      box.innerHTML = `<div class="card"><p class="small muted" style="margin:0">ことばを入れると、${certs.length}資格の問題・解説・用語の中から探します。スペースで区切ると、すべてのことばを含むものを探します。</p></div>`
      return
    }
    const ok = (hay) => words.every((w) => hay.includes(w))
    const qs = all.q.filter((x) => (!certFilter || x.cert === certFilter) && ok(x.hay))
    const ts = all.t.filter((x) => (!certFilter || x.cert === certFilter) && ok(x.hay))
    const lsn = all.l.filter((x) => (!certFilter || x.cert === certFilter) && ok(x.hay))
    const byCert = {}
    for (const x of qs) (byCert[x.cert] ||= []).push(x)
    box.innerHTML = `
      <div class="small muted" style="margin:0 2px 8px">教科書 ${lsn.length}回 ・ 問題 ${qs.length}件 ・ 用語 ${ts.length}件</div>
      ${lsn.length ? `<div class="card section" style="margin-top:0"><div class="section-h"><h2 style="font-size:15px">教科書</h2></div>${lsn.slice(0, 20).map((x) => `<button class="search-hit" data-lesson="${esc(x.cert)}/${esc(x.l.id)}">
          <div class="xsmall muted">${esc(getCert(x.cert)?.short || '')} ・ ${esc(catName(x.cert, x.l.cat))}</div>
          <div class="small"><b>${esc(x.l.title)}</b></div><div class="xsmall">${snippet(x.l.body.replace(/^##\s+|^[->]\s+/gm, ''), words)}</div></button>`).join('')}${lsn.length > 20 ? `<p class="xsmall muted">ほか ${lsn.length - 20}回</p>` : ''}</div>` : ''}
      ${ts.length ? `<div class="card"><div class="section-h"><h2 style="font-size:15px">用語</h2></div>${ts.slice(0, 30).map((x) => `<div class="term-item"><div class="row between"><span class="t">${esc(x.t.term)}</span><span class="chip">${esc(getCert(x.cert)?.short || '')}</span></div><div class="m">${esc(x.t.meaning)}</div>${x.t.example ? `<div class="e">例：${esc(x.t.example)}</div>` : ''}</div>`).join('')}${ts.length > 30 ? `<p class="xsmall muted">ほか ${ts.length - 30}件。ことばを足して、しぼり込んでください。</p>` : ''}</div>` : ''}
      ${Object.entries(byCert).map(([cid, list]) => `<div class="card section">
        <div class="section-h"><h2 style="font-size:15px">${esc(getCert(cid)?.short || cid)}の問題 <span class="muted small">${list.length}件</span></h2>
          <button class="btn soft sm" data-solve="${cid}">${icon('play', 'xs')}${Math.min(list.length, 30)}問を解く</button></div>
        ${list.slice(0, 40).map((x) => `<button class="search-hit" data-qid="${esc(x.q.id)}">
          <div class="xsmall muted">${esc(catName(cid, x.q.cat))}${x.q.no ? ` ・ 公開問題 問${x.q.no}` : ''}</div>
          <div class="small">${snippet(x.q.stem + ' ' + x.q.explanation, words)}</div></button>`).join('')}
        ${list.length > 40 ? `<p class="xsmall muted">ほか ${list.length - 40}件</p>` : ''}
      </div>`).join('')}
      ${!qs.length && !ts.length && !lsn.length ? `<div class="card">${emptyState('search', '見つかりませんでした。ことばを短くするか、別の言い方で探してください。')}</div>` : ''}`
    animateIn(box)
    box.onclick = (e) => {
      const lh = e.target.closest('[data-lesson]')
      if (lh) return go(`#/lesson/${lh.dataset.lesson}`)
      const hit = e.target.closest('[data-qid]')
      if (hit) return openQuestion(all.q.find((x) => x.q.id === hit.dataset.qid))
      const sv = e.target.closest('[data-solve]')
      if (sv) {
        const ids = (byCert[sv.dataset.solve] || []).slice(0, 30).map((x) => x.q.id)
        startQuiz({ cert: sv.dataset.solve, mode: 'search', ids, title: `検索「${query.trim().slice(0, 12)}」` })
      }
    }
  }

  function openQuestion(x) {
    if (!x) return
    const q = x.q
    const labels = KANA_CERTS.includes(x.cert) ? KANA : ALPHA
    sheet({
      title: `${getCert(x.cert)?.short || ''}の問題`,
      body: `<div class="xsmall muted" style="margin-bottom:6px">${esc(catName(x.cert, q.cat))}</div>
        <div class="q-stem long">${stemHTML(q)}</div>
        <div class="col" style="gap:6px">${q.choices.map((ch, k) => `<div class="small" style="display:flex;gap:8px;padding:8px 10px;border-radius:10px;background:${q.answer.includes(k) ? 'var(--ok-soft)' : 'var(--surface-2)'}"><b>${labels[k]}</b><span>${richText(ch)}</span>${q.answer.includes(k) ? `<span style="margin-left:auto;color:var(--ok)">${icon('check', 'xs')}</span>` : ''}</div>`).join('')}</div>
        <div class="explain" style="margin-top:12px">${richText(q.explanation)}${noteHTML(q)}${sourceHTML(q)}</div>
        <div class="grid2" style="margin-top:12px">
          <button class="btn primary" data-act="solve">${icon('play', 'sm')}この問題を解く</button>
          <button class="btn ghost" data-act="flag">${icon('flag', 'sm')}おかしい？</button>
        </div>`,
      onMount(body, close) {
        body.querySelector('[data-act="solve"]').onclick = () => { close(); startQuiz({ cert: x.cert, mode: 'search', ids: [q.id], title: '検索した問題' }) }
        body.querySelector('[data-act="flag"]').onclick = () => openFlagSheet(q)
      },
    })
  }

  const doRun = debounce(run, 180)
  el.querySelector('#sq').addEventListener('input', (e) => { query = e.target.value; doRun() })
  el.querySelector('#sq').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.target.blur(); run() } })
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]')
    if (!b) return
    certFilter = b.dataset.c
    el.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === b))
    run()
  })
  run()
  if (!query) setTimeout(() => el.querySelector('#sq')?.focus(), 300)
}
