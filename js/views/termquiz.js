// 用語クイズ：用語と用語辞典の説明から作る4択（答えると、用語カードと同じ復習の記録に入る）
import { store } from '../store.js'
import { cert as getCert, terms as loadTerms, catName } from '../data.js'
import { icon } from '../icons.js'
import { esc, richText, vibrate, today, shuffle } from '../util.js'
import { bar, animateIn, ring, confetti, loadError, toast } from '../ui.js'
import { recordTerm } from '../srs.js'
import { makeTermQuiz } from '../termquiz.js'
import { go } from '../nav.js'
import { canSpeak, speak, stopSpeak, isSpeaking, speechText } from '../speech.js'

const N = 10
const KANA_CERTS = ['itpass', 'sg', 'jstqb', 'genai']

export async function render(el, p) {
  const certId = p.parts[0]
  const c = getCert(certId)
  if (!c) { go('#/home', { replace: true }); return }
  let pool
  try { pool = await loadTerms(certId) } catch (e) { loadError(el, () => render(el, p), `#/cert/${certId}/terms`); return }
  const cat = p.query.cat || ''
  const ids = p.query.ids ? p.query.ids.split(',') : null
  const s = store.get()
  const d = today()
  const inCat = (t) => !cat || (cat === '_dict' ? t.dict : cat === '_base' ? !t.cat && !t.dict : t.cat === cat)
  let targets
  if (ids) targets = pool.filter((t) => ids.includes(t.id))
  else {
    const cand = pool.filter(inCat)
    const due = shuffle(cand.filter((t) => s.t[t.id] && s.t[t.id].due <= d))
    const fresh = [...shuffle(cand.filter((t) => !s.t[t.id] && !t.dict)), ...shuffle(cand.filter((t) => !s.t[t.id] && t.dict))]
    const rest = shuffle(cand.filter((t) => s.t[t.id] && s.t[t.id].due > d))
    targets = [...due, ...fresh, ...rest]
  }
  const qs = makeTermQuiz(targets, pool).slice(0, ids ? ids.length : N)
  if (!qs.length) { toast('この分野では、クイズを作れる用語が足りません'); go(`#/cert/${certId}/terms`, { replace: true }); return }
  const labels = KANA_CERTS.includes(certId) ? ['ア', 'イ', 'ウ', 'エ'] : ['A', 'B', 'C', 'D']
  let i = 0
  const ans = []
  const t0 = Date.now()
  const title = cat === '_dict' ? '用語クイズ（用語辞典）' : cat && cat !== '_base' ? `用語クイズ：${catName(certId, cat)}` : '用語クイズ'

  function drawQ() {
    const q = qs[i]
    const a = ans[i]
    el.innerHTML = `
      <div class="quiz-top">
        <button class="icon-btn" data-act="close" aria-label="やめる">${icon('x')}</button>
        ${bar((i + (a ? 1 : 0)) / qs.length)}
        <span class="count">${i + 1} / ${qs.length}</span>
      </div>
      <div class="q-meta">
        <span class="chip" style="background:color-mix(in srgb, ${c.color} 14%, transparent);color:${c.color}">${esc(c.short)}</span>
        <span class="chip">${icon('cards', 'xs')}${esc(catName(certId, q.term.cat))}</span>
        ${q.term.dict ? '<span class="chip">辞典</span>' : ''}
        ${canSpeak() ? `<button class="icon-btn speak-btn ${isSpeaking('tq') ? 'on' : ''}" data-act="speak" aria-label="読み上げる">${icon('volume', 'sm')}</button>` : ''}
      </div>
      <div class="q-stem">${richText(q.stem)}</div>
      <div class="choices ${a ? 'locked' : ''}" role="radiogroup">
        ${q.choices.map((ch, k) => {
          let cls = ''
          if (a) cls = q.answer.includes(k) ? 'correct' : a.sel === k ? 'wrong' : 'dim'
          return `<button class="choice ${cls}" data-k="${k}" role="radio" aria-checked="${a ? a.sel === k : false}"><span class="lbl">${a && q.answer.includes(k) ? icon('check', 'xs') : a && a.sel === k ? icon('x', 'xs') : labels[k]}</span><span>${esc(ch)}</span></button>`
        }).join('')}
      </div>
      ${a ? `<div class="feedback ${a.ok ? 'ok' : 'ng'}" role="status"><span class="fb-ic">${icon(a.ok ? 'check' : 'x')}</span><div>${a.ok ? '正解' : '不正解'}<div class="small" style="font-weight:600;opacity:.85">正解は ${labels[q.answer[0]]}</div></div></div>
        <div class="explain"><h4>${icon('book', 'xs')}${esc(q.term.term)}${q.term.reading ? `（${esc(q.term.reading)}）` : ''}</h4><div>${esc(q.term.meaning)}</div>${q.term.example ? `<div class="src" style="font-size:13px;margin-top:6px">例：${esc(q.term.example)}</div>` : ''}${q.term.src ? `<div class="src">範囲：${esc(q.term.src)}</div>` : ''}</div>` : ''}
      <div class="quiz-foot">${a ? `<button class="btn primary lg grow" data-act="next">${i + 1 >= qs.length ? '結果を見る' : '次の問題へ'}${icon('right')}</button>` : '<p class="small muted grow" style="margin:0;text-align:center">説明と用語を結びつけて覚えましょう</p>'}</div>`
    animateIn(el)
    if (a) setTimeout(() => el.querySelector('.feedback')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  function finish() {
    const correct = ans.filter((x) => x.ok).length
    store.addSession({ cert: certId, mode: 'tquiz', title, total: qs.length, correct, durationSec: Math.round((Date.now() - t0) / 1000), source: '用語クイズ' })
    if (correct / qs.length >= 0.8) setTimeout(confetti, 300)
    const wrong = qs.filter((q, k) => ans[k] && !ans[k].ok).map((q) => q.id)
    el.innerHTML = `
      <div class="quiz-top"><button class="icon-btn" data-act="close" aria-label="閉じる">${icon('x')}</button><div class="grow" style="font-weight:800">用語クイズの結果</div></div>
      <div class="result-hero">
        ${ring(correct / qs.length, { size: 140, stroke: 12, label: `${correct}<small style="font-size:14px">/${qs.length}</small>`, sub: '正解' })}
        <h2>${correct === qs.length ? '全問正解です' : correct / qs.length >= 0.8 ? 'よくできました' : 'おつかれさまでした'}</h2>
        <div class="muted small">まちがえた用語は、明日の用語カードの復習に出ます。</div>
      </div>
      <div class="section col">
        ${wrong.length ? `<button class="btn primary block lg" data-act="retry">${icon('rotate')}まちがえた ${wrong.length}語をもう一度</button>` : ''}
        <button class="btn ${wrong.length ? 'soft' : 'primary'} block" data-act="again">${icon('cards', 'sm')}次の${N}問</button>
        <button class="btn ghost block" data-act="close">用語の一覧へ</button>
      </div>`
    animateIn(el)
    el.querySelector('[data-act="retry"]')?.addEventListener('click', () => go(`#/tquiz/${certId}?ids=${encodeURIComponent(wrong.join(','))}${cat ? `&cat=${cat}` : ''}&r=${Date.now()}`))
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    if (b.dataset.k != null && !ans[i]) {
      const k = Number(b.dataset.k)
      const ok = qs[i].answer.includes(k)
      ans[i] = { sel: k, ok }
      recordTerm(qs[i].id, ok ? 2 : 0)
      if (store.get().profile.vibrate) vibrate(ok ? 18 : [30, 60, 30])
      stopSpeak()
      drawQ()
      return
    }
    const act = b.dataset.act
    if (act === 'next') { stopSpeak(); i++; if (i >= qs.length) finish(); else { drawQ(); window.scrollTo({ top: 0, behavior: 'smooth' }) } }
    else if (act === 'close') { stopSpeak(); go(`#/cert/${certId}/terms`) }
    else if (act === 'again') go(`#/tquiz/${certId}?${cat ? `cat=${cat}&` : ''}r=${Date.now()}`)
    else if (act === 'speak') {
      if (isSpeaking('tq')) { stopSpeak(); b.classList.remove('on'); return }
      const q = qs[i]
      speak(speechText(q.stem) + '。' + q.choices.map((ch, k) => `${labels[k]}、${ch}`).join('。'), { key: 'tq', onend: () => b.classList.remove('on') })
      b.classList.add('on')
    }
  })
  drawQ()
  return () => stopSpeak()
}
