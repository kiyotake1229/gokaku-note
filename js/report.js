// 相談相手が見る、進み具合レポート
import { loadMeta, cert as getCert, orderedCerts } from './data.js'
import { icon } from './icons.js'
import { esc, fmtMin, pct } from './util.js'
import { ring, bar, barChart, certMark, animateIn, toast } from './ui.js'
import { decode, replyURL, shareOrCopy, normalizeReport } from './share.js'

const STATUS = { todo: ['未着手', ''], doing: ['学習中', 'primary'], booked: ['受験予定', 'warn'], passed: ['合格', 'ok'] }
const MODE = { mock: '模擬試験', manual: '問題集・公式サンプル' }
const WD = ['日', '月', '火', '水', '木', '金', '土']
const DRAFT = 'gokaku.replyDraft'

const view = document.getElementById('view')

function md(s) {
  // "MM-DD" または "YYYY-MM-DD" → 「9月26日」（読めない日付は「—」）
  const p = String(s || '').split('-').map(Number)
  const [m, d] = p.length === 3 ? [p[1], p[2]] : p
  return Number.isFinite(m) && Number.isFinite(d) && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${m}月${d}日` : '—'
}
function fmtStamp(t) {
  const d = new Date(t)
  return `${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fail(msg) {
  view.innerHTML = `<div class="empty" style="padding-top:25vh">${icon('alert')}<div><b>レポートを開けませんでした</b><br>${esc(msg)}</div></div>`
}

async function main() {
  const m = location.hash.match(/[#&]d=([A-Za-z0-9_-]+)/)
  if (!m) return fail('リンクが途中で切れている可能性があります。もう一度、リンクを送ってもらってください。')
  let data
  try {
    await loadMeta()
    data = normalizeReport(await decode(m[1]))
  } catch (e) {
    if (e && e.code === 'unsupported') return fail('お使いのブラウザでは、このレポートを開けません。スマホやブラウザを最新にしてから、もう一度開いてください。')
    return fail('リンクが途中で切れているか、形式が違います。もう一度、リンクを送ってもらってください。')
  }
  render(data)
}

function render(data) {
  const name = data.n ? `${data.n}さん` : '学習者'
  const ageDays = Math.floor((Date.now() - data.t) / 86400000)
  const week = data.days.slice(-7)
  const weekMin = week.reduce((a, x) => a + x[1], 0)
  const weekAns = week.reduce((a, x) => a + x[2], 0)
  const weekOk = week.reduce((a, x) => a + x[3], 0)
  const studyDays = data.days.filter((x) => x[1] > 0 || x[2] > 0).length
  if (!data.days.length) data.days = [['01-01', 0, 0, 0]]
  const chart = data.days.slice(-14).map((x, i, arr) => ({ label: String(Number(x[0].slice(3))), value: x[1], today: i === arr.length - 1 }))
  let draft = {}
  try { draft = JSON.parse(localStorage.getItem(DRAFT) || '{}'); if (draft.t !== data.t) draft = { t: data.t, c: {}, msg: '' } } catch (e) { draft = { t: data.t, c: {}, msg: '' } }

  document.title = `${name}の学習の進み具合｜合格ノート`
  view.innerHTML = `
    <div class="report-head">
      <div class="row" style="gap:12px">
        <img src="icons/icon-192.png" alt="" width="44" height="44" style="border-radius:12px">
        <div class="grow"><div class="eyebrow">合格ノート ・ 進み具合レポート</div><h1 class="big-title" style="margin:2px 0 0">${esc(name)}の学習の進み具合</h1></div>
      </div>
      <p class="small muted" style="margin:10px 0 0">${fmtStamp(data.t)} 時点の記録です${ageDays >= 1 ? `（${ageDays}日前）` : ''}。</p>
      ${ageDays >= 7 ? `<div class="alert" style="margin-top:10px">${icon('alert')}<div><b>少し前の記録です</b><span class="small">最新の状況は、新しいリンクを送ってもらってください。</span></div></div>` : ''}
    </div>

    <div class="report-grid section">
      <div class="report-main">
        <div class="stat-grid">
          <div class="card stat-card"><span>この7日の学習時間</span><b>${fmtMin(weekMin)}</b><small>目標 ${fmtMin(data.g * 7)}</small>${bar(weekMin / (data.g * 7 || 1), weekMin >= data.g * 7 ? 'ok' : '')}</div>
          <div class="card stat-card"><span>連続して勉強した日数</span><b>${data.sk}日</b><small>この4週間で ${studyDays}日</small></div>
          <div class="card stat-card"><span>この7日に解いた問題</span><b>${weekAns}問</b><small>${weekAns ? `正答率 ${pct(weekOk, weekAns)}%` : '—'}</small></div>
          <div class="card stat-card"><span>学習時間の合計</span><b>${fmtMin(data.tm)}</b><small>学習ログの合計</small></div>
        </div>

        <div class="card section">
          <div class="section-h"><h2>最近2週間の学習時間</h2><span class="small muted">分</span></div>
          ${barChart(chart, { goal: data.g, width: window.innerWidth >= 900 ? 620 : 320 })}
          <div class="xsmall muted row" style="gap:6px;justify-content:flex-end"><svg width="18" height="4" aria-hidden="true"><line x1="0" x2="18" y1="2" y2="2" stroke="var(--ok)" stroke-dasharray="4 3" stroke-width="2"/></svg>1日の目標 ${data.g}分</div>
        </div>

        <div class="section">
          <div class="section-h"><h2>資格ごとの状況</h2><span class="small muted">おすすめの順番</span></div>
          <div class="col" style="gap:10px">${data.certs.map(certCard).join('')}</div>
          <p class="xsmall muted" style="margin:8px 2px 0">習熟度：解いた問題を、覚えた度合いで重みづけした割合。申込みの目安：全体の6割以上に挑戦し、直近3回の練習がすべて8割以上（または模擬試験で8割以上）。</p>
        </div>
      </div>

      <div class="report-side">
        <div class="card" id="asks">
          <div class="section-h"><h2>聞きたいこと</h2><span class="small muted">${data.asks.length}件</span></div>
          ${data.asks.length ? data.asks.map((a) => `
            <div class="ask-item">
              <div class="xsmall muted">${md(a.d)} ・ ${esc(getCert(a.c)?.short || '')}${a.w ? ` ・ ${esc(a.w)}` : ''}</div>
              <div class="ask-q">${esc(a.q)}</div>
              <label class="sr-only" for="ans-${esc(a.id)}">この質問への答え</label>
              <textarea class="textarea" id="ans-${esc(a.id)}" data-ask="${esc(a.id)}" rows="2" placeholder="答えやアドバイスを書く（任意）">${esc((draft.c || {})[a.id] || '')}</textarea>
            </div>`).join('') : `<p class="small muted" style="margin:0">いまは、答えを待っている質問はありません。</p>`}
          <div class="field" style="margin-top:14px"><label for="msg">${esc(name)}へのひとこと（任意）</label><textarea class="textarea" id="msg" rows="3" placeholder="例：今週もよく続けられています。次はGA4の模擬試験に挑戦してみましょう。">${esc(draft.msg || '')}</textarea></div>
          <button class="btn primary block" id="send">${icon('share', 'sm')}${esc(name)}に返信を送る</button>
          <p class="xsmall muted" style="margin:8px 0 0">返信のリンクを送ると、${esc(name)}のアプリの学習ログに、あなたのコメントが入ります。</p>
        </div>

        <div class="card section">
          <div class="section-h"><h2>最近の練習の結果</h2></div>
          ${data.recent.length ? data.recent.map((r) => { const rate = r.t ? r.k / r.t : 0; return `
            <div class="log-item"><div class="top"><i class="dot" style="background:${getCert(r.c)?.color || 'var(--faint)'}"></i><span>${md(r.d)}</span><span>・</span><b style="color:var(--ink-2)">${esc(getCert(r.c)?.short || '')}</b><span class="grow"></span><span class="chip ${rate >= 0.8 ? 'ok' : rate >= 0.6 ? 'warn' : 'ng'}">${pct(r.k, r.t)}%</span></div>
            <div class="note muted">${esc(MODE[r.m] || '練習問題')} ${r.t}問中 ${r.k}問正解</div></div>` }).join('') : `<p class="small muted" style="margin:0">まだ記録がありません。</p>`}
        </div>

        <div class="card section">
          <div class="section-h"><h2>最近の学習ログ</h2></div>
          ${data.logs.length ? data.logs.map((l) => `
            <div class="log-item"><div class="top"><i class="dot" style="background:${getCert(l.c)?.color || 'var(--faint)'}"></i><span>${md(l.d)}</span><span>・</span><b style="color:var(--ink-2)">${esc(getCert(l.c)?.short || 'その他')}</b><span class="grow"></span><span class="chip">${fmtMin(l.mi)}</span></div>
            ${l.w ? `<div class="what">${esc(l.w)}</div>` : ''}${l.l ? `<div class="note">${icon('check', 'xs')} ${esc(l.l)}</div>` : ''}</div>`).join('') : `<p class="small muted" style="margin:0">まだ記録がありません。</p>`}
        </div>
      </div>
    </div>

    <p class="xsmall muted" style="margin:18px 2px 0">このページは、${esc(name)}がアプリから送ったリンクの中身だけを表示しています。記録はサーバーには送られません（書きかけの返信だけ、この端末に一時的に残ります。返信を送ると消えます）。</p>`
  animateIn(view)

  // 下書きを残す（このブラウザの中だけ）
  const saveDraft = () => {
    const c = {}
    view.querySelectorAll('[data-ask]').forEach((t) => { if (t.value.trim()) c[t.dataset.ask] = t.value.trim() })
    draft = { t: data.t, c, msg: view.querySelector('#msg').value.trim() }
    try { localStorage.setItem(DRAFT, JSON.stringify(draft)) } catch (e) { /* 保存できなくても続ける */ }
  }
  view.addEventListener('input', (e) => { if (e.target.matches('textarea')) saveDraft() })

  view.querySelector('#send').addEventListener('click', async () => {
    saveDraft()
    if (!Object.keys(draft.c).length && !draft.msg) { toast('答えか、ひとことを書いてください'); return }
    const url = await replyURL({ from: data.m || '', msg: draft.msg, c: draft.c, rt: data.t })
    const r = await shareOrCopy({ title: '合格ノートへの返信', text: `${name}へ：学習ログにコメントを書きました。リンクを開くとアプリに取り込めます。`, url })
    if (r === 'copied') toast('返信のリンクをコピーしました。LINEなどで送ってください', { ms: 5000 })
    else if (r === 'fail') showLink(url)
    if (r === 'shared' || r === 'copied') { try { localStorage.removeItem(DRAFT) } catch (e) { /* 消せなくても続ける */ } }
  })
}

function showLink(url) {
  const box = document.createElement('div')
  box.className = 'card section'
  box.innerHTML = `<b>このリンクをコピーして送ってください</b><textarea class="textarea" readonly rows="4" style="margin-top:8px;font-size:13px">${esc(url)}</textarea>`
  view.querySelector('#asks').appendChild(box)
  const ta = box.querySelector('textarea')
  ta.focus(); ta.select()
}

function certCard(c) {
  const meta = getCert(c.id)
  if (!meta) return ''
  const [label, cls] = STATUS[c.st] || STATUS.todo
  const hoursGoal = meta.hours ? `目安 ${meta.hours[0]}〜${meta.hours[1]}時間` : ''
  const weak = (c.wk || []).map(([cat, v]) => `${esc(meta.catById[cat]?.name || cat)} ${v}%`).join('、')
  const ex = c.ex
  return `<div class="card cert-card report-cert">
    ${certMark(meta)}
    <div class="grow">
      <div class="row between" style="gap:8px"><span class="name">${esc(meta.short)}</span>
        <span class="row" style="gap:4px">${c.rd && c.st !== 'passed' ? `<span class="chip ok">${icon('check', 'xs')}申込みの目安に到達</span>` : ''}<span class="chip ${cls}">${label}</span></span></div>
      ${c.st === 'todo' ? `<div class="meta">まだ始めていません</div>` : `
      <div style="margin-top:8px">${bar(c.ma / 100, c.ma >= 75 ? 'ok' : '')}</div>
      <div class="meta" style="margin-top:6px"><span>習熟 <b>${c.ma}%</b></span><span>解いた ${c.se}/${c.to}問</span><span>直近の正答率 ${c.rr == null ? '—' : `<b>${c.rr}%</b>`}</span><span>学習 ${fmtMin(c.mi)}${hoursGoal ? `（${hoursGoal}）` : ''}</span></div>
      ${c.mk ? `<div class="meta"><span>模擬試験（${md(c.mk.d)}）：${c.mk.c}/${c.mk.t}問（${pct(c.mk.c, c.mk.t)}%）${c.mk.p ? ' 合格ライン到達' : ''}</span></div>` : ''}
      ${weak ? `<div class="meta"><span>弱い分野：${weak}</span></div>` : ''}
      ${c.nt ? `<div class="meta"><span>まだ手をつけていない分野：${c.nt}</span></div>` : ''}
      ${c.du || c.wr ? `<div class="meta"><span>復習待ち ${c.du}問 ・ 間違えたままの問題 ${c.wr}問</span></div>` : ''}`}
      ${ex ? `<div class="meta" style="margin-top:4px">${ex.d ? `<span>${icon('calendar', 'xs')} 受験日 ${md(ex.d)}</span>` : ex.a ? `<span>申込み ${md(ex.a)}</span>` : ''}${ex.r ? `<span>結果：<b>${esc(ex.r)}</b> ${esc(ex.s)}</span>` : ''}${ex.e ? `<span>有効期限 ${md(ex.e)}</span>` : ''}</div>` : ''}
    </div>
  </div>`
}

main()
