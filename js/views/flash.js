// 用語カード
import { store } from '../store.js'
import { cert as getCert, terms as loadTerms, catName } from '../data.js'
import { icon } from '../icons.js'
import { esc, shuffle, today, vibrate } from '../util.js'
import { bar, animateIn, ring, loadError } from '../ui.js'
import { recordTerm } from '../srs.js'
import { go } from '../nav.js'
import { canSpeak, speak, speakAsync, stopSpeak, isSpeaking } from '../speech.js'

const ROUND = 20
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

export async function render(el, p) {
  const id = p.parts[0]
  const c = getCert(id)
  if (!c) return go('#/home', { replace: true })
  let all
  try { all = await loadTerms(id) } catch (e) { loadError(el, () => render(el, p), `#/cert/${id}/terms`); return }
  const s = store.get()
  const cat = p.query.cat || ''
  const pool = all.filter((t) => !cat || (cat === '_base' ? !t.cat : t.cat === cat))
  const d = today()
  let deck
  if (p.query.set === 'all') deck = shuffle(pool).slice(0, ROUND)
  else if (p.query.set === 'retry' && p.query.ids) { const ids = p.query.ids.split(','); deck = pool.filter((t) => ids.includes(t.id)) }
  else {
    const due = pool.filter((t) => s.t[t.id] && s.t[t.id].due <= d)
    const fresh = [...shuffle(pool.filter((t) => !s.t[t.id] && !t.dict)), ...shuffle(pool.filter((t) => !s.t[t.id] && t.dict))]
    deck = [...shuffle(due), ...fresh].slice(0, ROUND)
    if (!deck.length) deck = shuffle(pool).slice(0, ROUND)
  }
  let i = 0
  let flipped = false
  const graded = {}
  let listening = false
  let listenRun = 0

  function draw() {
    if (i >= deck.length) return drawEnd()
    const t = deck[i]
    el.innerHTML = `
      <div class="quiz-top">
        <button class="icon-btn" data-act="close" aria-label="閉じる">${icon('x')}</button>
        ${bar(i / deck.length)}
        <span class="count">${i + 1} / ${deck.length}</span>
      </div>
      <div class="q-meta"><span class="chip" style="background:color-mix(in srgb, ${c.color} 14%, transparent);color:${c.color}">${esc(c.short)}</span><span class="chip">${esc(catName(id, t.cat))}</span>
        ${canSpeak() ? `<button class="icon-btn speak-btn ${isSpeaking('card') ? 'on' : ''}" data-act="speak" aria-label="読み上げる">${icon('volume', 'sm')}</button>` : ''}</div>
      ${canSpeak() ? `<div class="listen-bar"><button class="btn ${listening ? 'primary' : 'ghost'} sm" data-act="listen">${icon('headphones', 'xs')}${listening ? '聞き流しを止める' : '聞き流し（自動で読み上げて次へ）'}</button></div>` : ''}
      <div class="flash-stage">
        <div class="flash ${flipped ? 'flip' : ''}" data-act="flip" role="button" tabindex="0" aria-label="${flipped ? '用語の面に戻す' : '意味を見る'}">
          <div class="flash-face flash-front">
            <div class="term">${esc(t.term)}</div>
            ${t.reading ? `<div class="reading">${esc(t.reading)}</div>` : ''}
            <div class="tap-hint">${icon('hand', 'xs')}意味を1行で言えたら、タップして答え合わせ</div>
          </div>
          <div class="flash-face flash-back">
            <div class="term">${esc(t.term)}</div>
            <div class="meaning">${esc(t.meaning)}</div>
            ${t.example ? `<div class="example"><b>身近な例</b>${esc(t.example)}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="grade" style="${flipped ? '' : 'visibility:hidden'}">
        <button class="g0" data-g="0">${icon('x', 'sm')}言えなかった</button>
        <button class="g1" data-g="1">${icon('help', 'sm')}あいまい</button>
        <button class="g2" data-g="2">${icon('check', 'sm')}言えた</button>
      </div>
      <p class="xsmall muted" id="fhint" style="text-align:center;margin-top:14px">${flipped ? '自分の説明と比べて、正直に選びましょう' : 'ことばの意味を、見ないで説明してみてください'}</p>`
    animateIn(el)
  }

  function drawEnd() {
    if (!Object.keys(graded).length) {
      // 聞き流しだけで終わったとき
      el.innerHTML = `
        <div class="quiz-top"><button class="icon-btn" data-act="close" aria-label="閉じる">${icon('x')}</button><div class="grow" style="font-weight:800">聞き流しが終わりました</div></div>
        <div class="empty" style="padding-top:12vh">${icon('headphones')}<div><b>${deck.length}語を聞きました</b><br>覚えたかどうかは、カードをめくって「言えた」で確かめましょう。</div></div>
        <div class="section col">
          <button class="btn primary block lg" data-act="more">${icon('cards', 'sm')}カードで確かめる</button>
          <button class="btn ghost block" data-act="close">${esc(c.short)}のページへ</button>
        </div>`
      animateIn(el)
      return
    }
    const n = [0, 1, 2].map((g) => Object.values(graded).filter((x) => x === g).length)
    const retry = Object.entries(graded).filter(([, g]) => g < 2).map(([k]) => k)
    el.innerHTML = `
      <div class="quiz-top"><button class="icon-btn" data-act="close" aria-label="閉じる">${icon('x')}</button><div class="grow" style="font-weight:800">用語カードの結果</div></div>
      <div class="result-hero">
        ${ring(deck.length ? n[2] / deck.length : 0, { size: 140, stroke: 12, label: `${n[2]}<small style="font-size:14px">/${deck.length}</small>`, sub: '言えた' })}
        <h2>${n[2] === deck.length ? 'ぜんぶ言えました' : 'おつかれさまでした'}</h2>
      </div>
      <div class="grid3 section">
        <div class="stat"><b style="color:var(--ok)">${n[2]}</b><span>言えた</span></div>
        <div class="stat"><b style="color:var(--warn)">${n[1]}</b><span>あいまい</span></div>
        <div class="stat"><b style="color:var(--ng)">${n[0]}</b><span>言えなかった</span></div>
      </div>
      <div class="section col">
        ${retry.length ? `<button class="btn primary block lg" data-act="retry">${icon('rotate')}あいまい・言えなかった ${retry.length}語をもう一度</button>` : ''}
        <button class="btn soft block" data-act="more">${icon('cards', 'sm')}次の${ROUND}語</button>
        <button class="btn ghost block" data-act="close">${esc(c.short)}のページへ</button>
      </div>`
    animateIn(el)
    el.querySelector('[data-act="retry"]')?.addEventListener('click', () => go(`#/flash/${id}?set=retry&ids=${encodeURIComponent(retry.join(','))}${cat ? `&cat=${cat}` : ''}`))
  }

  function flip() {
    flipped = !flipped
    const f = el.querySelector('.flash')
    if (!f) return
    f.classList.toggle('flip', flipped)
    f.setAttribute('aria-label', flipped ? '用語の面に戻す' : '意味を見る')
    const hint = el.querySelector('#fhint')
    if (hint) hint.textContent = flipped ? '自分の説明と比べて、正直に選びましょう' : 'ことばの意味を、見ないで説明してみてください'
    const gr = el.querySelector('.grade')
    gr.style.visibility = flipped ? '' : 'hidden'
    if (flipped) gr.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' })
  }

  const cardText = (t, back) => back ? `${t.term}。${t.meaning}${t.example ? `。たとえば、${t.example}` : ''}` : `${t.term}${t.reading ? `、${t.reading}` : ''}`
  // 聞き流し：用語 → 少し待つ → 意味 → 次のカード（成績は記録しない）
  async function listenLoop() {
    const run = ++listenRun
    while (listening && run === listenRun && i < deck.length) {
      const t = deck[i]
      if (flipped) { flipped = false; draw() }
      await speakAsync(cardText(t, false), { key: 'listen' })
      if (!listening || run !== listenRun) return
      await wait(1800)
      if (!listening || run !== listenRun) return
      flip()
      await speakAsync(cardText(t, true), { key: 'listen' })
      if (!listening || run !== listenRun) return
      await wait(1500)
      if (!listening || run !== listenRun) return
      i++
      flipped = false
      draw()
    }
    if (run === listenRun) { listening = false; if (i < deck.length) draw() }
  }
  function stopListen() { listening = false; listenRun++; stopSpeak() }

  function grade(g) {
    stopListen()
    const t = deck[i]
    recordTerm(t.id, g)
    graded[t.id] = g
    if (s.profile.vibrate) vibrate(g === 2 ? 12 : 6)
    i++
    flipped = false
    draw()
  }

  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act], [data-g]')
    if (!t) return
    if (t.dataset.g != null) return grade(Number(t.dataset.g))
    const act = t.dataset.act
    if (act === 'flip') flip()
    else if (act === 'speak') {
      if (isSpeaking('card')) { stopSpeak(); t.classList.remove('on'); return }
      stopListen()
      speak(cardText(deck[i], flipped), { key: 'card', onend: () => t.classList.remove('on') })
      t.classList.add('on')
    } else if (act === 'listen') {
      if (listening) { stopListen(); draw() } else { listening = true; draw(); listenLoop() }
    }
    else if (act === 'close') { stopListen(); go(`#/cert/${id}/terms`) }
    else if (act === 'more') go(`#/flash/${id}?set=due${cat ? `&cat=${cat}` : ''}&r=${Date.now()}`)
  })
  const onKey = (e) => {
    if (i >= deck.length) return
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip() }
    else if (flipped && ['1', '2', '3'].includes(e.key)) grade(Number(e.key) - 1)
  }
  document.addEventListener('keydown', onKey)
  draw()
  return () => { document.removeEventListener('keydown', onKey); stopListen() }
}
