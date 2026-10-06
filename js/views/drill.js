// 計算ドリル：数字を変えて何度でも解ける計算問題
import { store } from '../store.js'
import { cert as getCert } from '../data.js'
import { icon } from '../icons.js'
import { esc, richText, pct, vibrate, today } from '../util.js'
import { bar, animateIn, ring, confetti } from '../ui.js'
import { DRILLS_BY_CERT, drill, makeDrill, drillMix } from '../drills.js'
import { go } from '../nav.js'
import { canSpeak, speak, stopSpeak, isSpeaking, speechText } from '../speech.js'

const KANA = ['ア', 'イ', 'ウ', 'エ']
const N = 10

export function drillTypes(certId) { return DRILLS_BY_CERT[certId] || [] }

export async function render(el, p) {
  const certId = p.parts[0]
  const c = getCert(certId)
  const types = drillTypes(certId)
  if (!c || !types.length) { go('#/home', { replace: true }); return }
  const type = p.query.t || ''
  if (!type) return drawList()

  const isMix = type === 'mix'
  if (!isMix && !types.includes(type)) { go(`#/drill/${certId}`, { replace: true }); return }
  const title = isMix ? 'まぜて10問' : drill(type).name
  const qs = isMix ? drillMix(types, N) : makeDrill(type, N)
  let i = 0
  const ans = [] // { sel, ok }
  const t0 = Date.now()

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
        <span class="chip">${icon('calc', 'xs')}${esc(q.name)}</span>
        ${canSpeak() ? `<button class="icon-btn speak-btn ${isSpeaking('dq') ? 'on' : ''}" data-act="speak" aria-label="問題を読み上げる">${icon('volume', 'sm')}</button>` : ''}
      </div>
      <div class="q-stem">${richText(q.stem)}</div>
      <div class="choices ${a ? 'locked' : ''}" role="radiogroup">
        ${q.choices.map((ch, k) => {
          let cls = ''
          if (a) cls = q.answer.includes(k) ? 'correct' : a.sel === k ? 'wrong' : 'dim'
          return `<button class="choice ${cls}" data-k="${k}" role="radio" aria-checked="${a ? a.sel === k : false}"><span class="lbl">${a && q.answer.includes(k) ? icon('check', 'xs') : a && a.sel === k ? icon('x', 'xs') : KANA[k]}</span><span>${esc(ch)}</span></button>`
        }).join('')}
      </div>
      ${a ? `<div class="feedback ${a.ok ? 'ok' : 'ng'}" role="status"><span class="fb-ic">${icon(a.ok ? 'check' : 'x')}</span><div>${a.ok ? '正解' : '不正解'}<div class="small" style="font-weight:600;opacity:.85">正解は ${KANA[q.answer[0]]}</div></div></div>
        <div class="explain"><h4>${icon('calc', 'xs')}計算のしかた</h4><div>${richText(q.explanation)}</div></div>` : ''}
      <div class="quiz-foot">${a ? `<button class="btn primary lg grow" data-act="next">${i + 1 >= qs.length ? '結果を見る' : '次の問題へ'}${icon('right')}</button>` : '<p class="small muted grow" style="margin:0;text-align:center">紙とペンで計算してから選びましょう</p>'}</div>`
    animateIn(el)
    if (a) setTimeout(() => el.querySelector('.feedback')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  function finish() {
    const correct = ans.filter((x) => x.ok).length
    const s = store.get()
    const by = {}
    qs.forEach((q, k) => { const o = (by[q.type] ||= { n: 0, ok: 0 }); o.n++; if (ans[k] && ans[k].ok) o.ok++ })
    for (const [t, o] of Object.entries(by)) {
      const r = (s.drills[t] ||= { n: 0, ok: 0 })
      r.n += o.n; r.ok += o.ok; r.last = Date.now()
    }
    store.addSession({ cert: certId, mode: 'drill', title: `計算ドリル：${title}`, total: qs.length, correct, durationSec: Math.round((Date.now() - t0) / 1000), source: '計算ドリル' })
    if (correct / qs.length >= 0.8) setTimeout(confetti, 300)
    el.innerHTML = `
      <div class="quiz-top"><button class="icon-btn" data-act="close" aria-label="閉じる">${icon('x')}</button><div class="grow" style="font-weight:800">計算ドリルの結果</div></div>
      <div class="result-hero">
        ${ring(correct / qs.length, { size: 140, stroke: 12, label: `${correct}<small style="font-size:14px">/${qs.length}</small>`, sub: '正解' })}
        <h2>${correct === qs.length ? '全問正解です' : correct / qs.length >= 0.8 ? 'よくできました' : 'おつかれさまでした'}</h2>
        <div class="muted small">${esc(title)}</div>
      </div>
      <div class="section col">
        <button class="btn primary block lg" data-act="again">${icon('rotate')}数字を変えて、もう10問</button>
        <button class="btn ghost block" data-act="list">ドリルの一覧へ</button>
      </div>`
    animateIn(el)
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    if (b.dataset.k != null && !ans[i]) {
      const k = Number(b.dataset.k)
      const ok = qs[i].answer.includes(k)
      ans[i] = { sel: k, ok }
      if (store.get().profile.vibrate) vibrate(ok ? 18 : [30, 60, 30])
      stopSpeak()
      drawQ()
      return
    }
    const act = b.dataset.act
    if (act === 'next') { stopSpeak(); i++; if (i >= qs.length) finish(); else { drawQ(); window.scrollTo({ top: 0, behavior: 'smooth' }) } }
    else if (act === 'close' || act === 'list') { stopSpeak(); go(`#/drill/${certId}`) }
    else if (act === 'again') go(`#/drill/${certId}?t=${type}&r=${Date.now()}`)
    else if (act === 'speak') {
      if (isSpeaking('dq')) { stopSpeak(); b.classList.remove('on'); return }
      const q = qs[i]
      speak(speechText(q.stem) + '。' + q.choices.map((ch, k) => `${KANA[k]}、${ch}`).join('。'), { key: 'dq', onend: () => b.classList.remove('on') })
      b.classList.add('on')
    }
  })
  drawQ()
  return () => stopSpeak()

  function drawList() {
    const s = store.get()
    el.innerHTML = `
      <div class="topbar glass">
        <a class="icon-btn" href="#/cert/${certId}" aria-label="戻る">${icon('left')}</a>
        <div class="title">計算ドリル</div>
      </div>
      <div class="eyebrow">${esc(c.short)}</div>
      <h1 class="big-title">計算ドリル</h1>
      <p class="small muted" style="margin:4px 0 0">数字を変えて、何度でも解けます。答えはプログラムで計算しているので、問題ごとの誤りはありません。紙とペンを用意して解きましょう。</p>
      <button class="mode hero-mode section" data-t="mix" style="width:100%">
        <span class="mi">${icon('shuffle', 'lg')}</span>
        <div class="grow"><b style="font-size:16px">まぜて${N}問</b><span style="display:block;margin-top:2px">この資格の計算問題を、いろいろな種類からまぜて出します</span></div>${icon('right')}
      </button>
      <div class="card section">
        ${types.map((t) => { const d = drill(t); const r = s.drills[t]; return `
          <button class="list-row" data-t="${t}">
            <span class="lr-ic">${icon('calc', 'sm')}</span>
            <div class="grow"><b>${esc(d.name)}</b><div class="small muted">${esc(d.desc)}${r && r.n ? ` ・ これまで ${r.n}問・正答率 ${pct(r.ok, r.n)}%` : ''}</div></div>
            ${icon('right', 'sm chev')}
          </button>` }).join('')}
      </div>
      ${certId === 'itpass' ? `<div class="alert info section">${icon('info')}<div><b>2027年からの新しい試験を受ける場合</b><span class="small">IPA のシラバス案（Ver.0.1）では、2進数・16進数などの基数の計算や、アルゴリズム・プログラミングが見当たりません。損益分岐点・ROI・稼働率・アローダイアグラムなどは残っています。2進数などのドリルは、今の試験（2026年12月27日まで）向けと考えてください。</span></div></div>` : ''}
      <p class="xsmall muted" style="margin:10px 2px">ドリルの結果は「問題の結果」と学習の記録に入りますが、受験申込みの目安（直近3回の正答率）には使いません。</p>`
    animateIn(el)
    el.onclick = (e) => {
      const b = e.target.closest('[data-t]')
      if (b) go(`#/drill/${certId}?t=${b.dataset.t}`)
    }
  }
}
