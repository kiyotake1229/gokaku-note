/**
 * 合格ノート：記録の自動共有（Google スプレッドシートに保存する）
 *
 * 使い方は、アプリの「設定 → 自動で共有（Googleスプレッドシート）」に書いてあります。
 * - 書き込みには、アプリが作った鍵（w）が必要です。最初に届いた鍵だけが登録されます。
 * - 進み具合を読む（相談相手のページ）には、別の鍵（r）が必要です。
 * - 鍵を作り直したいときは、このエディタで resetKeys を1回実行してください。
 */
var SHEET_DATA = '_data'
var SHEET_LOG = '毎日の記録'
var CHUNK = 40000
var NAMES = {
  'line-basic': 'LINE Basic', 'line-adv': 'LINE Advanced', ga4: 'GA4', gads: 'Google広告',
  jstqb: 'JSTQB', genai: '生成AIパスポート', itpass: 'ITパスポート', sg: '情報セキュリティM'
}

function doGet(e) {
  var p = (e && e.parameter) || {}
  var keys = getKeys_()
  if (p.what === 'ping') return out_({ ok: true, app: 'gokaku-note', ready: !!keys })
  if (!keys) return out_({ ok: false, error: 'not-setup' })
  var what = p.what || 'report'
  if (what === 'report' && p.k && p.k === keys.r) return out_({ ok: true, at: Number(getProp_('AT') || 0), report: readJSON_('report') })
  if (what === 'backup' && p.k && p.k === keys.w) return out_({ ok: true, at: Number(getProp_('AT') || 0), backup: readJSON_('backup') })
  return out_({ ok: false, error: 'key' })
}

function doPost(e) {
  var body
  try { body = JSON.parse(e.postData.contents) } catch (err) { return out_({ ok: false, error: 'bad-json' }) }
  var lock = LockService.getScriptLock()
  if (!lock.tryLock(15000)) return out_({ ok: false, error: 'busy' })
  try {
    var keys = getKeys_()
    if (!keys) {
      // 最初の送信で鍵を登録する（このあとは、同じ鍵でないと書き込めない）
      if (!validKey_(body.w) || !validKey_(body.r)) return out_({ ok: false, error: 'key' })
      PropertiesService.getScriptProperties().setProperties({ W: body.w, R: body.r })
      keys = { w: body.w, r: body.r }
    }
    if (body.w !== keys.w) return out_({ ok: false, error: 'key' })
    var now = Date.now()
    if (body.report) { writeJSON_('report', body.report); writeLog_(body.report) }
    if (body.backup) writeJSON_('backup', body.backup)
    PropertiesService.getScriptProperties().setProperty('AT', String(now))
    return out_({ ok: true, at: now })
  } finally {
    lock.releaseLock()
  }
}

function resetKeys() {
  PropertiesService.getScriptProperties().deleteAllProperties()
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)
}
function getProp_(k) { return PropertiesService.getScriptProperties().getProperty(k) }
function getKeys_() {
  var w = getProp_('W'), r = getProp_('R')
  return w && r ? { w: w, r: r } : null
}
function validKey_(k) { return typeof k === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(k) }

// ---- データの保存（1つのセルに入る長さに分けて、見えないシートに置く） ----
function dataSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var sh = ss.getSheetByName(SHEET_DATA)
  if (!sh) { sh = ss.insertSheet(SHEET_DATA); sh.hideSheet() }
  return sh
}
function rowOf_(name) { return name === 'report' ? 1 : 2 }
function writeJSON_(name, obj) {
  var s = JSON.stringify(obj)
  var parts = []
  // 先頭に「|」を付けて、数字や式として読まれないようにする
  for (var i = 0; i < s.length; i += CHUNK) parts.push('|' + s.slice(i, i + CHUNK))
  var sh = dataSheet_()
  var row = rowOf_(name)
  var last = sh.getLastColumn()
  if (last > 0) sh.getRange(row, 1, 1, last).clearContent()
  var range = sh.getRange(row, 1, 1, parts.length + 1)
  range.setNumberFormat('@')
  range.setValues([[name].concat(parts)])
}
function readJSON_(name) {
  var sh = dataSheet_()
  var last = sh.getLastColumn()
  if (last < 2) return null
  var vals = sh.getRange(rowOf_(name), 2, 1, last - 1).getValues()[0]
  var s = ''
  for (var i = 0; i < vals.length; i++) { var v = String(vals[i] || ''); if (!v) break; s += v.charAt(0) === '|' ? v.slice(1) : v }
  return s ? JSON.parse(s) : null
}

// ---- 毎日の記録（1日1行。同じ日は上書き） ----
function writeLog_(r) {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var sh = ss.getSheetByName(SHEET_LOG)
  if (!sh) {
    sh = ss.insertSheet(SHEET_LOG, 0)
    sh.getRange('A:A').setNumberFormat('@')
    sh.appendRow(['日付', 'この7日の学習時間（分）', '連続日数', 'この7日に解いた問題', 'この7日の正答率', '学習時間の合計（分）', '資格ごとの習熟度', '聞きたいこと（件）'])
    sh.setFrozenRows(1)
  }
  var days = (r.days || []).slice(-7)
  var min = 0, ans = 0, ok = 0
  for (var i = 0; i < days.length; i++) { min += Number(days[i][1]) || 0; ans += Number(days[i][2]) || 0; ok += Number(days[i][3]) || 0 }
  var date = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Tokyo', 'yyyy-MM-dd')
  var mastery = (r.certs || []).filter(function (c) { return c && c.st !== 'todo' }).map(function (c) { return (NAMES[c.id] || c.id) + ' ' + (Number(c.ma) || 0) + '%' }).join(' / ')
  var row = [date, min, Number(r.sk) || 0, ans, ans ? Math.round(ok / ans * 100) + '%' : '', Number(r.tm) || 0, mastery, (r.asks || []).length]
  var last = sh.getLastRow()
  if (last >= 2 && String(sh.getRange(last, 1).getValue()) === date) sh.getRange(last, 1, 1, row.length).setValues([row])
  else sh.appendRow(row)
}
