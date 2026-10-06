// 2027年からの新しい試験の範囲の問題を、ふだんの出題に入れるかどうか
import { store } from './store.js'
import { today } from './util.js'

export const NEW_FROM = '2027-01-01'
// 新しい範囲の問題の id（作った問題 n27-、IPA のサンプル問題 s27-）
export const isNewId = (id) => /:(?:n27|s27)-/.test(String(id))

export function scopeSetting(certId) {
  return ((store.get().profile.newScope || {})[certId]) || 'auto'
}
export function newScopeOn(certId) {
  const v = scopeSetting(certId)
  if (v === 'on') return true
  if (v === 'off') return false
  const e = store.get().exams[certId] || {}
  // 受験日が2027年以降なら新しい範囲。受験日が決まっていなければ、今の試験が終わる日のあとから
  if (e.date) return e.date >= NEW_FROM
  return today() >= '2026-12-28'
}
export const inScope = (q, certId) => !isNewId(q.id) || newScopeOn(certId)
export function setScope(certId, v) {
  const s = store.get()
  s.profile.newScope = { ...(s.profile.newScope || {}), [certId]: v }
  store.commit(true)
}
