// 「この問題、おかしい？」の報告と、報告した問題の一覧
import { store } from '../store.js'
import { cert as getCert, catName } from '../data.js'
import { icon } from '../icons.js'
import { esc, today } from '../util.js'
import { sheet, toast, confirmDialog } from '../ui.js'
import { shareOrCopy } from '../share.js'

export const FLAG_KINDS = [
  { id: 'answer', label: '正解がおかしい' },
  { id: 'explain', label: '解説がおかしい・分かりにくい' },
  { id: 'stem', label: '問題文・選択肢がおかしい' },
  { id: 'old', label: '情報が古い' },
  { id: 'other', label: 'その他' },
]
export const kindLabel = (k) => (FLAG_KINDS.find((x) => x.id === k) || FLAG_KINDS[4]).label
export const isFlagged = (qid) => !!(store.get().flags || {})[qid]
export const flagList = () => Object.entries(store.get().flags || {}).map(([id, f]) => ({ id, ...f })).sort((a, b) => (b.t || 0) - (a.t || 0))

export function openFlagSheet(q, { onChange } = {}) {
  const cur = (store.get().flags || {})[q.id]
  let kind = (cur && cur.kind) || ''
  sheet({
    title: 'この問題について知らせる',
    body: `<p class="small muted" style="margin-top:0">気づいたことを記録しておきます。記録は「設定 → 報告した問題」にたまり、まとめて送れます。次の内容チェックで、報告のあった問題から優先して確かめます。</p>
      <div class="xsmall muted" style="margin-bottom:6px">${esc(getCert(q.id.split(':')[0])?.short || '')} ・ ${esc(catName(q.id.split(':')[0], q.cat))}${q.no ? ` ・ 公開問題 問${q.no}` : ''}</div>
      <div class="flag-stem">${esc(String(q.stem).replace(/```[\s\S]*?```/g, '［コード］').slice(0, 120))}${q.stem.length > 120 ? '…' : ''}</div>
      <div class="field" style="margin-top:14px"><span class="lab">どこがおかしいと思いましたか</span>
        <div class="chips" id="fk" role="radiogroup">${FLAG_KINDS.map((k) => `<button type="button" class="chip outline ${kind === k.id ? 'on' : ''}" data-k="${k.id}" role="radio" aria-checked="${kind === k.id}">${esc(k.label)}</button>`).join('')}</div></div>
      <div class="field"><label for="fn">くわしく（なくてもかまいません）</label>
        <textarea class="textarea" id="fn" rows="3" maxlength="500" placeholder="例：公式ページでは〇〇と書かれていた">${esc((cur && cur.note) || '')}</textarea></div>
      <div class="row" style="gap:10px">
        ${cur ? `<button type="button" class="btn ghost" data-act="del">${icon('trash', 'sm')}取り消す</button>` : ''}
        <button type="button" class="btn primary grow" data-act="save">${icon('check', 'sm')}${cur ? '直して保存' : '記録する'}</button>
      </div>`,
    onMount(body, close) {
      body.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => {
        kind = b.dataset.k
        body.querySelectorAll('[data-k]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)) })
      }))
      body.querySelector('[data-act="save"]').onclick = () => {
        if (!kind) { toast('どこがおかしいかを選んでください'); return }
        const s = store.get()
        s.flags = s.flags || {}
        s.flags[q.id] = { t: Date.now(), kind, note: body.querySelector('#fn').value.trim().slice(0, 500), cert: q.id.split(':')[0], stem: String(q.stem).replace(/\s+/g, ' ').slice(0, 80) }
        store.commit(true)
        close()
        toast('記録しました。ありがとうございます')
        onChange && onChange()
      }
      body.querySelector('[data-act="del"]')?.addEventListener('click', () => {
        const s = store.get()
        delete s.flags[q.id]
        store.commit(true)
        close()
        toast('取り消しました')
        onChange && onChange()
      })
    },
  })
}

export function flagsText() {
  const list = flagList()
  const lines = [`【合格ノート：問題の報告】${today()}時点・${list.length}件`]
  for (const f of list) {
    const c = getCert(f.cert)
    lines.push(`・${f.id}（${c ? c.short : f.cert}）［${kindLabel(f.kind)}］${f.stem || ''}`)
    if (f.note) lines.push(`　メモ：${f.note}`)
  }
  return lines.join('\n')
}

export function openFlagList() {
  const draw = (body) => {
    const list = flagList()
    body.innerHTML = list.length ? `
      <p class="small muted" style="margin-top:0">送り先は、アプリを作った人（このアプリの内容をチェックする担当）や、相談相手です。送った内容は、次の内容チェックで優先して確かめます。</p>
      <div class="grid2" style="margin-bottom:12px">
        <button class="btn primary" data-act="share">${icon('share', 'sm')}まとめて送る</button>
        <button class="btn ghost" data-act="copy">${icon('clipboard', 'sm')}コピー</button>
      </div>
      ${list.map((f) => `<div class="flag-item">
        <div class="row between" style="gap:8px"><span class="chip ng">${esc(kindLabel(f.kind))}</span><span class="xsmall muted grow">${esc(getCert(f.cert)?.short || f.cert)} ・ ${new Date(f.t).getMonth() + 1}月${new Date(f.t).getDate()}日</span>
          <button class="icon-btn" data-del="${esc(f.id)}" aria-label="この報告を消す">${icon('trash', 'xs')}</button></div>
        <div class="small" style="margin-top:4px">${esc(f.stem || '')}</div>
        ${f.note ? `<div class="xsmall muted" style="margin-top:2px">メモ：${esc(f.note)}</div>` : ''}
        <div class="xsmall muted" style="margin-top:2px;font-family:var(--mono)">${esc(f.id)}</div>
      </div>`).join('')}` : `<div class="empty">${icon('flag')}<div>報告した問題はありません。<br>問題の解説の下にある「この問題、おかしい？」から記録できます。</div></div>`
  }
  sheet({
    title: '報告した問題',
    body: '<div id="fl"></div>',
    onMount(body) {
      const root = body.querySelector('#fl')
      draw(root)
      root.addEventListener('click', async (e) => {
        const b = e.target.closest('button')
        if (!b) return
        if (b.dataset.del) {
          if (!(await confirmDialog({ title: 'この報告を消しますか？', ok: '消す', danger: true }))) return
          delete store.get().flags[b.dataset.del]
          store.commit(true)
          draw(root)
          return
        }
        if (b.dataset.act === 'copy') {
          try { await navigator.clipboard.writeText(flagsText()); toast('コピーしました') } catch (err) { toast('コピーできませんでした') }
        } else if (b.dataset.act === 'share') {
          const r = await shareOrCopy({ title: '問題の報告', text: flagsText(), url: '' })
          if (r === 'copied') toast('コピーしました。LINEなどに貼り付けて送ってください', { ms: 4000 })
          else if (r === 'fail') toast('送れませんでした')
        }
      })
    },
  })
}
