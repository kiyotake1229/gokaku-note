// 自動で共有（Google スプレッドシート）の設定
import { store } from '../store.js'
import { icon } from '../icons.js'
import { esc } from '../util.js'
import { sheet, toast, confirmDialog } from '../ui.js'
import { mentorName } from '../nav.js'
import { GAS_CODE } from '../gas-code.js'
import { connect, disconnect, syncNow, validSyncURL, errText, liveReportURL, fetchCloudBackup, transferCode, readTransferCode, adoptSync } from '../sync.js'
import { shareOrCopy } from '../share.js'
import { backupSummary } from '../backup.js'

const ago = (t) => {
  if (!t) return 'まだ'
  const m = Math.floor((Date.now() - t) / 60000)
  if (m < 1) return 'たった今'
  if (m < 60) return `${m}分前`
  if (m < 1440) return `${Math.floor(m / 60)}時間前`
  return `${Math.floor(m / 1440)}日前`
}

export function syncStatusText() {
  const c = store.get().sync
  if (!c) return '未設定'
  if (c.err) return `うまく送れていません（${ago(c.at)}）`
  return `つながっています（最後に送ったのは ${ago(c.okAt)}）`
}

export function openSyncSheet() {
  const m = mentorName()
  sheet({
    title: '自動で共有（Google スプレッドシート）',
    body: '<div id="sy"></div>',
    onMount(body) {
      const root = body.querySelector('#sy')
      const draw = () => {
        const c = store.get().sync
        root.innerHTML = c ? `
          <div class="alert ${c.err ? '' : 'info'}">${icon(c.err ? 'alert' : 'cloud')}<div><b>${esc(syncStatusText())}</b><span class="small">${c.err ? esc(errText(c.err)) : `勉強の記録が変わると、少したってから、あなたの Google スプレッドシートに自動で送ります。${esc(m)}は、送ったリンクからいつでも最新を見られます。`}</span></div></div>
          <div class="col" style="margin-top:12px">
            <button class="btn primary block" data-act="live">${icon('share', 'sm')}${esc(m)}に「いつでも最新」のリンクを送る</button>
            <button class="btn soft block" data-act="now">${icon('refresh', 'sm')}今すぐ送る</button>
          </div>
          <hr class="hr">
          <div class="section-h"><h2 style="font-size:15px">ほかの端末でつづける</h2></div>
          <p class="small muted" style="margin-top:0">スプレッドシートには、記録のバックアップも入っています。機種変更のときは、この「引き継ぎコード」を新しい端末の「設定 → 自動で共有」に貼り付けると、記録を戻せます。コードには書き込みの鍵が入っているので、ほかの人には送らないでください。</p>
          <div class="grid2">
            <button class="btn ghost" data-act="code">${icon('clipboard', 'sm')}引き継ぎコードをコピー</button>
            <button class="btn ghost" data-act="restore">${icon('download', 'sm')}記録を戻す</button>
          </div>
          <button class="btn ghost block" data-act="off" style="margin-top:12px;color:var(--ng)">つなぐのをやめる</button>
          <p class="xsmall muted" style="margin:8px 0 0">やめても、スプレッドシートに送った記録は残ります（消すときは、スプレッドシートを削除してください）。</p>` : `
          <p class="small" style="margin-top:0">あなたの Google スプレッドシートに、勉強の記録を自動で送る仕組みです。</p>
          <ul class="small" style="padding-left:1.2em;margin:0 0 10px;line-height:1.8">
            <li>${esc(m)}は、一度送ったリンクから、<b>いつでも最新の進み具合</b>を見られます（毎回送らなくてよくなります）。</li>
            <li>記録の<b>バックアップ</b>にもなります（機種変更やデータの消去のときに戻せます）。</li>
            <li>送り先は、あなたの Google アカウントのスプレッドシートだけです。</li>
          </ul>
          <details class="guide-sec" open><summary><span>準備のしかた（パソコンで10分ほど）</span>${icon('right', 'sm chev')}</summary>
            <ol class="small steps-list">
              <li>パソコンで Google スプレッドシートを開き、新しいスプレッドシートを作ります（名前は「合格ノートの記録」など）。</li>
              <li>メニューの「拡張機能」→「Apps Script」を開きます。</li>
              <li>下の「スクリプトをコピー」を押し、Apps Script の画面にある文字をすべて消してから貼り付けて、保存（フロッピーの形のボタン）します。<div style="margin-top:6px"><button class="btn soft sm" data-act="copycode">${icon('clipboard', 'xs')}スクリプトをコピー</button></div></li>
              <li>右上の「デプロイ」→「新しいデプロイ」を押し、歯車から種類「ウェブアプリ」を選びます。「次のユーザーとして実行」は「自分」、「アクセスできるユーザー」は「全員」にして、「デプロイ」を押します。</li>
              <li>初めてのときは、Google の「アクセスを承認」の画面が出ます。自分のアカウントを選び、「詳細」→「（安全ではないページ）に移動」→「許可」と進みます（自分で作ったスクリプトなので、この表示が出ます）。</li>
              <li>表示された「ウェブアプリ」の URL（https://script.google.com/macros/s/…/exec）をコピーして、スマホに送ります（LINE の自分だけのトークなど）。</li>
              <li>下の欄に URL を貼り付けて、「つなぐ」を押します。</li>
            </ol>
          </details>
          <div class="field" style="margin-top:12px"><label for="sy-url">ウェブアプリの URL、または引き継ぎコード</label>
            <input class="input" id="sy-url" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="url"></div>
          <button class="btn primary block" data-act="connect">${icon('link', 'sm')}つなぐ</button>
          <p class="xsmall muted" style="margin:10px 0 0">「アクセスできるユーザー：全員」にしても、アプリが作った鍵がないと、記録の読み書きはできません。鍵はこの端末の記録の中にあります。</p>`
      }
      draw()
      root.addEventListener('click', async (e) => {
        const b = e.target.closest('button')
        if (!b || b.disabled) return
        const act = b.dataset.act
        if (act === 'copycode') {
          try { await navigator.clipboard.writeText(GAS_CODE); toast('スクリプトをコピーしました') } catch (err) { toast('コピーできませんでした。パソコンで開いて、もう一度お試しください') }
        } else if (act === 'connect') {
          const v = root.querySelector('#sy-url').value.trim()
          b.disabled = true
          b.innerHTML = `${icon('refresh', 'sm')}つないでいます…`
          try {
            if (/^GN1\./.test(v)) {
              const cfg = await readTransferCode(v)
              const { data } = await fetchCloudBackup(cfg)
              const ok = await confirmDialog({ title: '記録を戻しますか？', message: `スプレッドシートにある記録（${backupSummary(data)}）に置きかわります。いまのこの端末の記録は消えます。`, ok: '戻す', danger: true })
              if (!ok) { draw(); return }
              store.replace(data)
              adoptSync(cfg)
              toast('記録を戻しました')
            } else {
              if (!validSyncURL(v)) { toast('「https://script.google.com/macros/s/…/exec」の形の URL を貼り付けてください', { ms: 4000 }); draw(); return }
              await connect(v)
              toast('つながりました。記録を送りました')
            }
          } catch (err) {
            toast(err && err.message === 'code' ? '引き継ぎコードが読めませんでした' : errText(err && err.code), { ms: 5000 })
          }
          draw()
        } else if (act === 'now') {
          b.disabled = true
          const ok = await syncNow()
          toast(ok ? '送りました' : errText(store.get().sync && store.get().sync.err), { ms: ok ? 2600 : 5000 })
          draw()
        } else if (act === 'live') {
          const url = await liveReportURL()
          const r = await shareOrCopy({ title: '学習の進み具合（いつでも最新）', text: `${store.get().profile.name || ''}の学習の進み具合です。このリンクはいつ開いても最新の記録が見られます。`, url })
          if (r === 'copied') toast('リンクをコピーしました。LINEなどで送ってください', { ms: 4000 })
          else if (r === 'fail') toast('送れませんでした')
        } else if (act === 'code') {
          try { await navigator.clipboard.writeText(await transferCode()); toast('引き継ぎコードをコピーしました。自分だけが見られる場所に保存してください', { ms: 4500 }) } catch (err) { toast('コピーできませんでした') }
        } else if (act === 'restore') {
          b.disabled = true
          try {
            const { data, at } = await fetchCloudBackup()
            const when = at ? new Date(at) : null
            const ok = await confirmDialog({ title: 'スプレッドシートの記録に戻しますか？', message: `${when ? `${when.getMonth() + 1}月${when.getDate()}日 ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')} に送った` : ''}記録（${backupSummary(data)}）に置きかわります。`, ok: '戻す', danger: true })
            if (ok) { const cfg = store.get().sync; store.replace(data); adoptSync(cfg); toast('記録を戻しました') }
          } catch (err) { toast(err && err.code === 'empty' ? 'まだバックアップがありません' : errText(err && err.code), { ms: 4500 }) }
          draw()
        } else if (act === 'off') {
          if (await confirmDialog({ title: '自動で共有するのをやめますか？', message: `${m}の「いつでも最新」のリンクは、新しい記録に更新されなくなります。`, ok: 'やめる', danger: true })) { disconnect(); toast('やめました'); draw() }
        }
      })
    },
  })
}
