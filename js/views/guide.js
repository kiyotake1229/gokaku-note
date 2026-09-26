// はじめに：資格取得の学習ガイド
import { guide as loadGuide } from '../data.js'
import { icon } from '../icons.js'
import { esc } from '../util.js'
import { guideHTML } from './cert.js'

export async function render(el) {
  const g = await loadGuide('intro')
  el.innerHTML = `
    <div class="topbar glass">
      <a class="icon-btn" href="#/home" aria-label="ホームへ戻る">${icon('left')}</a>
      <div class="title">はじめに</div>
    </div>
    <div class="eyebrow">学習ガイド</div>
    <h1 class="big-title">${esc(g.title)}</h1>
    <p class="muted" style="margin:6px 0 14px">${esc(g.lead)}</p>
    ${g.notice ? `<div class="guide-body" style="padding:0">${guideHTML(g.notice)}</div>` : ''}
    <div class="card section">
      ${g.sections.map((sec, i) => `<details class="guide-sec" ${i < 1 ? 'open' : ''}><summary><span>${esc(sec.title)}</span>${icon('right', 'sm chev')}</summary><div class="guide-body">${guideHTML(sec.html)}</div></details>`).join('')}
    </div>
    <p class="xsmall muted" style="margin:10px 2px">作成 2026-09-20 ／ 試験の決まり・日程・画面は変わることがあります。申込みの前に、公式ページを必ず確認してください。</p>`
  // 資格一覧の「開く」はアプリ内の資格ページへ
  el.querySelectorAll('.xref').forEach((x) => {
    const row = x.closest('tr')
    const name = row ? row.textContent : ''
    const map = [['LINE', 'line-basic'], ['Google広告', 'gads'], ['GA4', 'ga4'], ['ITパスポート', 'itpass'], ['生成AI', 'genai'], ['JSTQB', 'jstqb'], ['情報セキュリティ', 'sg']]
    const hit = map.find(([k]) => name.includes(k))
    if (hit) {
      const a = document.createElement('a')
      a.href = `#/cert/${hit[1]}`
      a.textContent = '開く'
      a.style.fontWeight = '700'
      x.replaceWith(a)
    }
  })
}
