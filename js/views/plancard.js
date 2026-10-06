// 受験日までの計画のカード（ホームと資格のページで使う）
import { icon } from '../icons.js'
import { esc, fmtDate } from '../util.js'
import { bar } from '../ui.js'

const hm = (m) => (m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ''}` : `${m}分`)

export function planCardHTML(pl, { compact = false } = {}) {
  const c = pl.cert
  const doneRate = pl.qPerDay ? Math.min(1, pl.todayDone / pl.qPerDay) : 0
  let pace = ''
  if (pl.phase === 'final') {
    pace = `<div class="pace">${icon('target', 'sm')}<span>${pl.unseen === 0 ? '全部の問題に挑戦しました。' : ''}ここからは<b>仕上げ</b>の期間です。模擬試験を解いて、間違えた問題・迷った問題を解き直しましょう。</span></div>`
  } else if (pl.pace && pl.pace.behind) {
    pace = `<div class="pace behind">${icon('alert', 'sm')}<span>予定より <b>${-pl.pace.diff}問</b> 遅れています。数日かけて、1日に少し多め（＋${Math.ceil(-pl.pace.diff / 5)}問ほど）に解いて取り戻しましょう。</span></div>`
  } else if (pl.pace && pl.pace.ahead) {
    pace = `<div class="pace ahead">${icon('check', 'sm')}<span>予定より <b>${pl.pace.diff}問</b> 進んでいます。この調子です。</span></div>`
  } else if (pl.pace) {
    pace = `<div class="pace ahead">${icon('check', 'sm')}<span>予定どおりに進んでいます。</span></div>`
  }
  return `<div class="card plan-card">
    <div class="row between" style="gap:8px;align-items:flex-start">
      <div><div class="eyebrow">${icon('calendar', 'xs')} ${esc(c.short)}の受験日まで</div>
        <div class="plan-big"><b>${pl.left === 0 ? '今日' : pl.left}</b>${pl.left === 0 ? '' : '<span class="small muted">日</span>'}<span class="small muted" style="margin-left:6px">${fmtDate(pl.date)}</span></div></div>
      ${compact ? `<button class="btn soft sm" data-act="plan" data-cert="${c.id}">計画を見る</button>` : ''}
    </div>
    ${pl.phase === 'learn' ? `
    <div class="plan-rows">
      <div><b>${pl.newPerDay}問</b><span>新しい問題（1日）</span></div>
      <div><b>${pl.reviewPerDay}問</b><span>復習（1日の目安）</span></div>
      <div><b>約${pl.minPerDay}分</b><span>1日の時間の目安</span></div>
      <div><b>${pl.todayDone}問</b><span>今日解いた問題</span></div>
    </div>
    <div style="margin-top:10px">${bar(doneRate, doneRate >= 1 ? 'ok' : '')}</div>
    <div class="xsmall muted" style="margin-top:4px">今日の目安 ${pl.qPerDay}問のうち ${Math.min(pl.todayDone, pl.qPerDay)}問 ・ まだ解いていない問題 ${pl.unseen}問を ${fmtDate(pl.finishBy, false)}までに${pl.buffer ? `（最後の${pl.buffer}日は仕上げ用）` : ''}</div>` : ''}
    ${pace}
    ${!compact && pl.needMin > 0 ? `<div class="pace">${icon('clock', 'sm')}<span>勉強時間の目安（ガイドの${c.hours[0]}時間）まで、あと${hm(pl.needMin)}。1日あたり約${hm(Math.max(1, pl.hoursPerDay))}です。</span></div>` : ''}
    <button class="btn primary block" style="margin-top:12px" data-act="planq" data-cert="${c.id}">${icon('bolt', 'sm')}${pl.phase === 'final' ? 'おまかせで解く' : '今日の分を始める'}</button>
  </div>`
}

export function planPromptHTML(c) {
  return `<div class="card">
    <div class="row" style="gap:12px;align-items:flex-start">
      <span style="width:40px;height:40px;border-radius:12px;background:var(--primary-soft);color:var(--primary);display:grid;place-items:center;flex:none">${icon('calendar')}</span>
      <div class="grow"><b>受験日を入れると、1日の目安を出します</b><div class="small muted">残りの日数から「1日に何問・何分」を計算し、遅れているときはお知らせします。決まっていなければ、目標の日でもかまいません。</div></div>
    </div>
    <button class="btn soft block" style="margin-top:12px" data-act="exam">${icon('calendar', 'sm')}受験日（目標の日）を入れる</button>
  </div>`
}
