// 教科書：1回分のレッスンを読む
import { store } from '../store.js'
import { cert as getCert, catName, summaries } from '../data.js'
import { icon } from '../icons.js'
import { esc, fmtMin } from '../util.js'
import { animateIn, loadError, toast } from '../ui.js'
import { go } from '../nav.js'
import { getBook, flatLessons, isRead, markRead, lessonHTML, lessonSpeech } from '../lessons.js'
import { startQuiz } from './quiz.js'
import { openLogForm } from './log.js'
import { openSummarySheet } from './summary.js'
import { canSpeak, speak, stopSpeak, isSpeaking } from '../speech.js'

export async function render(el, p) {
  const certId = p.parts[0]
  const lid = p.parts[1]
  const c = getCert(certId)
  if (!c) { go('#/home', { replace: true }); return }
  const book = await getBook(certId)
  if (!book) { loadError(el, () => render(el, p), `#/cert/${certId}/book`); return }
  const all = flatLessons(book)
  const i = all.findIndex((l) => l.id === lid)
  if (i < 0) { go(`#/cert/${certId}/book`, { replace: true }); return }
  const l = all[i]
  const chapter = book.chapters.find((ch) => ch.cat === l.cat)
  const inCh = chapter.lessons.findIndex((x) => x.id === l.id)
  const prev = all[i - 1], next = all[i + 1]
  const lastInChapter = inCh === chapter.lessons.length - 1
  let sums = null
  summaries(certId).then((x) => { sums = x; draw() }).catch(() => {})
  const t0 = Date.now()

  function draw() {
    const read = isRead(l.id)
    const hasSum = !!(sums && sums.cats && sums.cats[l.cat])
    el.innerHTML = `
      <div class="topbar glass">
        <a class="icon-btn" href="#/cert/${certId}/book" aria-label="教科書の目次へ">${icon('left')}</a>
        <div class="title">${esc(c.short)}の教科書</div>
        ${canSpeak() ? `<button class="icon-btn speak-btn ${isSpeaking('lesson') ? 'on' : ''}" data-act="speak" aria-label="読み上げる">${icon('volume', 'sm')}</button>` : ''}
      </div>
      <article class="lesson">
        <div class="eyebrow">${esc(catName(certId, l.cat))} ・ 第${inCh + 1}回 / ${chapter.lessons.length}回</div>
        <h1 class="lesson-title">${esc(l.title)}</h1>
        <div class="row" style="gap:8px;margin:6px 0 14px"><span class="chip">${icon('clock', 'xs')}約${l.minutes || 4}分</span>${read ? `<span class="chip ok">${icon('check', 'xs')}読んだ</span>` : ''}</div>
        ${(l.goals || []).length ? `<div class="ls-goals"><b>この回でわかること</b><ul>${l.goals.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>` : ''}
        <div class="lesson-body">${lessonHTML(l.body)}</div>
        <div id="ls-end"></div>
      </article>
      <div class="section col">
        ${(l.check || []).length ? `<button class="btn primary block lg" data-act="check">${icon('target', 'sm')}確認問題（${l.check.length}問）を解く</button>` : ''}
        <div class="grid2">
          <button class="btn ${read ? 'ghost' : 'soft'}" data-act="read">${icon('check', 'sm')}${read ? '読んだ印を外す' : '読み終えた'}</button>
          <button class="btn ghost" data-act="log">${icon('edit', 'sm')}学習ログに記録</button>
        </div>
        ${lastInChapter ? `<div class="card" style="margin-top:4px">
          <b>「${esc(catName(certId, l.cat))}」の章を読み終えました</b>
          <div class="grid2" style="margin-top:10px">
            ${hasSum ? `<button class="btn soft sm" data-act="sum">${icon('list', 'xs')}要点まとめ</button>` : ''}
            <button class="btn soft sm" data-act="cat">${icon('play', 'xs')}この章の問題を解く</button>
          </div>
        </div>` : ''}
      </div>
      <div class="lesson-nav section">
        ${prev ? `<button class="btn ghost" data-go="${esc(prev.id)}">${icon('left', 'sm')}<span class="ellipsis">前の回</span></button>` : '<span></span>'}
        ${next ? `<button class="btn primary" data-go="${esc(next.id)}"><span class="ellipsis">次の回：${esc(next.title)}</span>${icon('right', 'sm')}</button>` : `<a class="btn primary" href="#/cert/${certId}/book">目次へ</a>`}
      </div>`
    animateIn(el)
    observeEnd()
  }

  // 最後まで読んだら（20秒以上ひらいていれば）、読んだ印をつける
  let io = null
  function observeEnd() {
    if (io) io.disconnect()
    if (isRead(l.id) || !('IntersectionObserver' in window)) return
    const end = el.querySelector('#ls-end')
    io = new IntersectionObserver((ents) => {
      if (ents.some((e) => e.isIntersecting) && Date.now() - t0 > 20000 && !isRead(l.id)) {
        markRead(l.id)
        io.disconnect()
        draw()
      }
    })
    if (end) io.observe(end)
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    if (b.dataset.go) { stopSpeak(); if (!isRead(l.id) && Date.now() - t0 > 20000) markRead(l.id); go(`#/lesson/${certId}/${b.dataset.go}`); return }
    const act = b.dataset.act
    if (act === 'speak') {
      if (isSpeaking('lesson')) { stopSpeak(); b.classList.remove('on'); return }
      speak(lessonSpeech(l), { key: 'lesson', onend: () => b.classList.remove('on') })
      b.classList.add('on')
    } else if (act === 'check') {
      stopSpeak()
      markRead(l.id)
      startQuiz({ cert: certId, mode: 'lesson', ids: l.check, title: `確認：${l.title}`, back: next ? `#/lesson/${certId}/${next.id}` : `#/cert/${certId}/book` })
    } else if (act === 'read') {
      markRead(l.id, !isRead(l.id))
      toast(isRead(l.id) ? '読んだ回に入れました' : '読んだ印を外しました')
      draw()
    } else if (act === 'log') {
      openLogForm({ cert: certId, minutes: Math.max(l.minutes || 4, Math.round((Date.now() - t0) / 60000)), what: `教科書「${l.title}」` })
    } else if (act === 'sum') openSummarySheet(certId, l.cat, sums)
    else if (act === 'cat') startQuiz({ cert: certId, mode: 'cat', cat: l.cat })
  })
  draw()
  return () => { stopSpeak(); if (io) io.disconnect() }
}
