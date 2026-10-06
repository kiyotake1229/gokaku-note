// カレンダーに登録するシート
import { store } from '../store.js'
import { icon } from '../icons.js'
import { esc, download } from '../util.js'
import { sheet, toast } from '../ui.js'
import { calendarItems, buildICS, googleLink, describe } from '../calendar.js'
import { isIOS } from '../pwa.js'

export function openCalendarSheet() {
  const s = store.get()
  let opts = { time: s.profile.studyTime || '20:00', minutes: s.profile.dailyGoal || 30, study: true, exams: true, deadlines: true }
  sheet({
    title: 'カレンダーに登録',
    body: `<div id="cal"></div>`,
    onMount(body) {
      const root = body.querySelector('#cal')
      const draw = () => {
        const { items, end } = calendarItems(opts)
        const nEx = items.filter((x) => x.key.startsWith('exam-')).length
        const nDl = items.filter((x) => x.key.startsWith('dl-')).length
        root.innerHTML = `
          <p class="small muted" style="margin-top:0">毎日の勉強の時間と、受験日・申込みの締切を、スマホのカレンダーに入れます。カレンダーのお知らせで、勉強の時間を思い出せます。</p>
          <div class="grid2">
            <div class="field"><label for="cal-time">勉強する時刻</label><input class="input" type="time" id="cal-time" value="${esc(opts.time)}"></div>
            <div class="field"><span class="lab">長さ</span><div class="input" style="background:var(--surface-2)">${opts.minutes}分（1日の目標）</div></div>
          </div>
          <button class="list-row" data-tg="study"><div class="grow"><b>毎日の勉強</b><div class="small muted">${esc(opts.time)}から${opts.minutes}分・${Number(end.slice(5, 7))}月${Number(end.slice(8, 10))}日まで毎日</div></div><span class="switch ${opts.study ? 'on' : ''}" role="switch" aria-checked="${opts.study}"></span></button>
          <button class="list-row" data-tg="exams"><div class="grow"><b>受験日</b><div class="small muted">${nEx || !opts.exams ? `${nEx}件（1週間前と前日の9時にお知らせ）` : '受験日が入っていません（資格のページの「受験」で入れられます）'}</div></div><span class="switch ${opts.exams ? 'on' : ''}" role="switch" aria-checked="${opts.exams}"></span></button>
          <button class="list-row" data-tg="deadlines"><div class="grow"><b>申込みの締切など</b><div class="small muted">${nDl}件</div></div><span class="switch ${opts.deadlines ? 'on' : ''}" role="switch" aria-checked="${opts.deadlines}"></span></button>
          <div class="col" style="margin-top:14px">
            <button class="btn primary block" data-act="ics" ${items.length ? '' : 'disabled'}>${icon('calendar', 'sm')}${isIOS() ? 'iPhone のカレンダーに入れる' : 'カレンダーに入れる（.ics ファイル）'}</button>
            <details class="cal-google"><summary class="btn ghost block">${icon('external', 'sm')}Google カレンダーに入れる</summary>
              <div class="col" style="gap:6px;margin-top:8px">${items.map((it) => `<a class="list-row" href="${esc(googleLink(it))}" target="_blank" rel="noopener"><div class="grow"><b class="small">${esc(it.title)}</b><div class="xsmall muted">${esc(describe(it))}</div></div>${icon('external', 'xs')}</a>`).join('') || '<p class="small muted">入れる予定がありません。</p>'}</div>
              <p class="xsmall muted">1件ずつ Google カレンダーが開くので、「保存」を押します。</p>
            </details>
          </div>
          <p class="xsmall muted" style="margin:12px 0 0">${isIOS() ? 'iPhone：ボタンを押して共有メニューが出たら「ファイルに保存」を選び、「ファイル」アプリで保存したファイルを開くと「すべてを追加」でカレンダーに入ります。うまく入らないときは、Google カレンダーの方を使ってください。' : 'ダウンロードしたファイルを開くと、カレンダーのアプリに予定を追加できます。'}予定を変えたいときは、カレンダーのアプリで直接直すか、消してから入れ直してください。</p>`
      }
      draw()
      root.addEventListener('change', (e) => {
        if (e.target.id === 'cal-time') { opts.time = e.target.value || '20:00'; store.setProfile({ studyTime: opts.time }); draw() }
      })
      root.addEventListener('click', async (e) => {
        const b = e.target.closest('button')
        if (!b) return
        if (b.dataset.tg) { opts[b.dataset.tg] = !opts[b.dataset.tg]; draw(); return }
        if (b.dataset.act === 'ics') {
          const { items } = calendarItems(opts)
          if (!items.length) return
          const ics = buildICS(items)
          const name = '合格ノート.ics'
          try {
            const file = new File([ics], name, { type: 'text/calendar' })
            if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file], title: '合格ノートの予定' })
              toast('カレンダーのファイルを送りました')
              return
            }
          } catch (err) { if (err && err.name === 'AbortError') return }
          download(name, ics, 'text/calendar')
          toast('カレンダーのファイルを保存しました。開くと予定を追加できます', { ms: 4000 })
        }
      })
    },
  })
}
