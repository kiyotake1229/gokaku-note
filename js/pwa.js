// ホーム画面への追加（インストール）
let deferred = null
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e
  window.dispatchEvent(new Event('installable'))
})
window.addEventListener('appinstalled', () => { deferred = null; window.dispatchEvent(new Event('installable')) })

export const canPrompt = () => !!deferred
export async function promptInstall() {
  if (!deferred) return false
  deferred.prompt()
  const r = await deferred.userChoice.catch(() => null)
  deferred = null
  return r && r.outcome === 'accepted'
}
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function installHelpHTML() {
  if (isStandalone()) return '<p class="small" style="margin:0">ホーム画面から開いています。アプリとして使えています。</p>'
  if (isIOS()) {
    return `<ol class="small" style="margin:0;padding-left:1.3em;line-height:1.9">
      <li>Safari でこのページを開きます</li>
      <li>画面下の「共有」ボタン（四角から矢印が出ているアイコン）をタップ</li>
      <li>「ホーム画面に追加」を選び、右上の「追加」をタップ</li>
    </ol>`
  }
  return `<ol class="small" style="margin:0;padding-left:1.3em;line-height:1.9">
    <li>Chrome でこのページを開きます</li>
    <li>右上の「︙」メニューをタップ</li>
    <li>「ホーム画面に追加」または「アプリをインストール」を選びます</li>
  </ol>`
}

// iPhone の Safari で開いているとき（ホーム画面のアプリとは記録の保存場所が別になる）
export const isIOSSafariTab = () => isIOS() && !isStandalone()
export function iosNoticeHTML() {
  return `<div class="alert info"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg><div><b>iPhoneは、ホーム画面に追加してから使ってください</b><span class="small">Safari のタブで付けた記録は、ホーム画面のアプリには引き継がれません。また、Safari では長く開かないと記録が消えることがあります。追加の手順は「設定」にあります。</span></div></div>`
}

// 画面上部の帯の色を、アプリのテーマに合わせる
export function syncThemeColor() {
  const th = document.documentElement.getAttribute('data-theme')
  const dark = th === 'dark' || (!th && window.matchMedia('(prefers-color-scheme: dark)').matches)
  let m = document.querySelector('meta[name="theme-color"]')
  if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m) }
  m.content = dark ? '#0A0F1D' : '#F4F6FB'
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', syncThemeColor)
syncThemeColor()
