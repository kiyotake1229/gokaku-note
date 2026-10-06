// 分野ごとの「要点まとめ」
import { summaries, catName, cert as getCert } from '../data.js'
import { icon } from '../icons.js'
import { esc, richText } from '../util.js'
import { sheet, toast } from '../ui.js'
import { canSpeak, speak, stopSpeak, isSpeaking, speechText } from '../speech.js'

const inl = (t) => richText(t)

export function summaryBodyHTML(sm, { speakKey = '' } = {}) {
  if (!sm) return ''
  const pts = sm.points || [], pairs = sm.pairs || [], fx = sm.formulas || [], traps = sm.traps || []
  return `<div class="sum">
    ${sm.lead ? `<p class="sum-lead">${inl(sm.lead)}</p>` : ''}
    ${pts.length ? `<h4>${icon('check', 'xs')}要点</h4><ul class="sum-points">${pts.map((p) => `<li>${inl(p)}</li>`).join('')}</ul>` : ''}
    ${fx.length ? `<h4>${icon('calc', 'xs')}計算の式</h4>${fx.map((f) => `<div class="sum-formula"><b>${esc(f.name)}</b><div class="expr">${esc(f.expr)}</div>${f.note ? `<small>${esc(f.note)}</small>` : ''}</div>`).join('')}` : ''}
    ${pairs.length ? `<h4>${icon('shuffle', 'xs')}まぎらわしい組</h4>${pairs.map((p) => `<div class="sum-pair"><div class="ab"><b>${esc(p.a)}</b><span>と</span><b>${esc(p.b)}</b></div><p>${inl(p.diff)}</p></div>`).join('')}` : ''}
    ${traps.length ? `<h4>${icon('alert', 'xs')}ひっかけに注意</h4><ul class="sum-traps">${traps.map((t) => `<li>${inl(t)}</li>`).join('')}</ul>` : ''}
    ${speakKey && canSpeak() ? `<button class="btn ghost sm" data-speak-sum="${esc(speakKey)}" style="margin-top:12px">${icon('volume', 'xs')}読み上げる</button>` : ''}
  </div>`
}

export function summarySpeech(sm) {
  if (!sm) return ''
  const parts = [sm.lead, ...(sm.points || []), ...(sm.formulas || []).map((f) => `${f.name}は、${f.expr}。${f.note || ''}`), ...(sm.pairs || []).map((p) => `${p.a}と${p.b}の違い。${p.diff}`), ...(sm.traps || []).map((t) => `注意。${t}`)]
  return parts.filter(Boolean).map(speechText).join('。')
}

export async function openSummarySheet(certId, catId, loaded = null) {
  let data = loaded
  if (!data) {
    try { data = await summaries(certId) } catch (e) { toast('要点まとめを読み込めませんでした'); return }
  }
  const sm = data && data.cats && data.cats[catId]
  if (!sm) { toast('この分野の要点まとめは準備中です'); return }
  sheet({
    title: `要点：${catName(certId, catId)}`,
    body: `<div class="xsmall muted" style="margin:-4px 0 8px">${esc(getCert(certId)?.short || '')}</div>${summaryBodyHTML(sm, { speakKey: 'sum' })}
      <p class="xsmall muted" style="margin:14px 0 0">この要点は、アプリの問題と用語（事実確認ずみ）をもとにまとめたものです。</p>`,
    onMount(body) {
      body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-speak-sum]')
        if (!b) return
        if (isSpeaking('sum')) { stopSpeak(); b.classList.remove('on'); return }
        speak(summarySpeech(sm), { key: 'sum', onend: () => b.classList.remove('on') })
        b.classList.add('on')
      })
    },
    onClose() { stopSpeak() },
  })
}
