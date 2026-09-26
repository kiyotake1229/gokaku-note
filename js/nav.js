// 画面の移動
import { store } from './store.js'

export function go(hash, { replace = false } = {}) {
  const h = hash.startsWith('#') ? hash : '#' + hash
  if (location.hash === h) return refresh()
  if (replace) location.replace(h)
  else location.hash = h
}
export function refresh() {
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}
export function mentorName() {
  return store.get().profile.mentor || '相談相手'
}
