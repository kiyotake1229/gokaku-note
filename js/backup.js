// バックアップ：保存（共有メニュー／ダウンロード）と読み込み、保存のお知らせ
import { store } from './store.js'
import { today, download } from './util.js'

const DAY = 86400000
export const BACKUP_EVERY_DAYS = 30
export const backupName = () => `合格ノート_バックアップ_${today()}.json`
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

export function lastBackupDays() {
  const at = store.get().backup && store.get().backup.at
  return at ? Math.floor((Date.now() - at) / DAY) : null
}

// お知らせを出すか（記録がある程度たまっていて、前回から30日以上、または一度もしていない）
export function backupDue() {
  const s = store.get()
  const activity = s.sessions.length + s.logs.length
  if (activity < 3) return null
  if (s.backupSnooze && Date.now() < s.backupSnooze) return null
  // Google スプレッドシートに自動で保存できていれば、お知らせはいらない
  if (s.sync && s.sync.okAt && Date.now() - s.sync.okAt < 7 * DAY) return null
  const days = lastBackupDays()
  if (days != null && days < BACKUP_EVERY_DAYS) return null
  return { days }
}
export function snoozeBackup(days = 7) {
  store.get().backupSnooze = Date.now() + days * DAY
  store.commit(true)
}

// 共有メニューが使えれば、そこから「ファイルに保存」やLINEに送れる。使えなければダウンロード
export async function saveBackup() {
  const json = store.exportJSON()
  const name = backupName()
  let how = 'download'
  try {
    const file = new File([json], name, { type: 'application/json' })
    if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: '合格ノートのバックアップ' })
      how = 'share'
    } else {
      download(name, json, 'application/json')
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancel'
    download(name, json, 'application/json')
  }
  store.get().backup = { at: Date.now(), how }
  store.commit(true)
  return how
}

// 読み込んだファイルの中身を確かめる（形が違えば例外）
export async function readBackupFile(file) {
  const j = JSON.parse(await file.text())
  const data = isObj(j) && isObj(j.data) ? j.data : j
  if (!isObj(data) || !Array.isArray(data.logs) || !isObj(data.q)) throw new Error('形式が違います')
  return data
}
export function backupSummary(data) {
  const q = Object.values(data.q || {}).filter((r) => r && r.seen).length
  return `学習ログ ${data.logs.length}件・解いた問題 ${q}問`
}
