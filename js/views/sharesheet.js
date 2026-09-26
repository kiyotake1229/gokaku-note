// 相談相手に進み具合を送る
import { store } from '../store.js'
import { meta } from '../data.js'
import { icon } from '../icons.js'
import { esc } from '../util.js'
import { sheet, toast } from '../ui.js'
import { mentorName, go } from '../nav.js'
import { buildReport, reportURL, reportText } from '../report-build.js'
import { shareOrCopy } from '../share.js'

export function openShareSheet() {
  const m = mentorName()
  sheet({
    title: `${m}に進み具合を送る`,
    body: `<div id="shs"><div class="skeleton" style="height:160px"></div></div>`,
    async onMount(body, close) {
      const root = body.querySelector('#shs')
      let url, text
      try {
        url = await reportURL()
        text = reportText(buildReport(), meta().byId, url)
      } catch (e) {
        root.innerHTML = `<p class="small">レポートを作れませんでした。もう一度お試しください。</p>`
        return
      }
      const mark = () => { store.get().shared = { at: Date.now() }; store.commit(true) }
      root.innerHTML = `
        <p class="small muted" style="margin-top:0">いまの学習の記録から、${esc(m)}が見るためのページのリンクを作りました。LINE やメールで送ると、${esc(m)}はそれを開くだけで、資格ごとの進み具合・学習時間・「聞きたいこと」を見られます。</p>
        <div class="share-preview">${esc(text.replace(url, '（リンク）'))}</div>
        <div class="col" style="margin-top:14px">
          <button class="btn primary block lg" data-act="share">${icon('share', 'sm')}送る</button>
          <div class="grid2">
            <button class="btn ghost" data-act="copytext">${icon('clipboard', 'sm')}文章をコピー</button>
            <button class="btn ghost" data-act="copyurl">${icon('clipboard', 'sm')}リンクをコピー</button>
          </div>
          <a class="btn soft block" href="${esc(url)}" target="_blank" rel="noopener">${icon('eye', 'sm')}${esc(m)}が見る画面を確かめる</a>
          <button class="btn ghost sm" data-act="showlink">送れないときは、リンクを表示する</button>
          <textarea class="textarea" id="linkbox" readonly rows="3" style="display:none;font-size:13px">${esc(url)}</textarea>
        </div>
        <p class="xsmall muted" style="margin:12px 0 0">リンクの中に記録が入っています（サーバーには保存されません）。リンクを知っている人は誰でも見られるので、${esc(m)}にだけ送ってください。</p>
        <hr class="hr">
        <div class="field" style="margin-bottom:8px"><label for="paste">${esc(m)}から届いた返信のリンクを貼り付ける</label>
          <textarea class="textarea" id="paste" rows="2" placeholder="返信のリンクを開いてもアプリに入らなかったときに使います"></textarea></div>
        <button class="btn ghost block" data-act="import">${icon('download', 'sm')}返信を受け取る</button>`
      root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-act]')
        if (!b) return
        const act = b.dataset.act
        const showLink = () => { const t = root.querySelector('#linkbox'); t.style.display = ''; t.focus(); t.select() }
        if (act === 'showlink') { showLink(); return }
        if (act === 'share') {
          const r = await shareOrCopy({ title: '学習の進み具合', text: text.replace(url, '').trimEnd(), url })
          if (r === 'shared') { mark(); toast('送りました') } else if (r === 'copied') { mark(); toast('コピーしました。LINEなどに貼り付けて送ってください', { ms: 4500 }) } else if (r === 'fail') { toast('送れませんでした。下のリンクを長押しでコピーしてください'); showLink() }
        } else if (act === 'copytext' || act === 'copyurl') {
          try { await navigator.clipboard.writeText(act === 'copytext' ? text : url); mark(); toast('コピーしました。LINEなどに貼り付けて送ってください', { ms: 4500 }) } catch (err) { toast('コピーできませんでした。下のリンクを長押しでコピーしてください'); showLink() }
        } else if (act === 'import') {
          const v = root.querySelector('#paste').value
          const mm = v.match(/[?&#]r=([A-Za-z0-9_-]+)/)
          if (!mm) { toast('返信のリンクを貼り付けてください'); return }
          close()
          go(`#/import?r=${mm[1]}`)
        }
      })
    },
  })
}
