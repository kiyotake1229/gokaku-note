// 合格までの道すじ：教科書 → 全分野に挑戦 → 苦手をなくす → 模擬試験 → 申込み
import { store } from './store.js'
import { cert as getCert } from './data.js'
import { certStats, targetRate } from './srs.js'
import { lessonStats, nextLesson } from './lessons.js'
import { inScope } from './scope.js'

export const TRY_RATE = 0.7   // 分野ごとに、この割合の問題に挑戦する
export const READ_RATE = 0.9  // 教科書は9割読めば次へ（あとから読み返せばよい）

export function roadmap(certId, qs, book) {
  const s = store.get()
  const c = getCert(certId)
  const st = certStats(certId)
  const target = targetRate(c)
  const ls = lessonStats(certId)
  const pool = qs.filter((q) => inScope(q, certId) && q.kind !== 'past')
  // 分野ごと：挑戦した割合と、最後に解いた結果での正答率（間違えた問題を解き直せば上がる）
  const cats = c.categories.map((cat) => {
    const list = pool.filter((q) => q.cat === cat.id)
    const seen = list.filter((q) => s.q[q.id] && s.q[q.id].seen)
    const ok = seen.filter((q) => s.q[q.id].lastOk !== false).length
    return { id: cat.id, name: cat.name, total: list.length, seen: seen.length, tried: list.length ? seen.length / list.length : 1, rate: seen.length ? ok / seen.length : null }
  }).filter((x) => x.total)
  const triedAll = cats.every((x) => x.tried >= TRY_RATE)
  // 1〜2問だけ解いて100%、とならないよう、5問以上解いた分野だけを「できた」に数える
  const strong = (x) => x.seen >= Math.min(5, x.total) && x.rate >= target
  const lowTry = [...cats].sort((a, b) => a.tried - b.tried)[0]
  const weak = cats.filter((x) => x.seen && x.rate < target).sort((a, b) => a.rate - b.rate)
  const strongAll = triedAll && cats.every(strong)
  const mocks = s.sessions.filter((x) => x.cert === certId && x.mode === 'mock')
  const mockOk = mocks.filter((x) => x.correct / x.total >= target).length
  const nl = book ? nextLesson(book) : null

  const steps = [
    {
      id: 'read', title: '教科書を読む',
      done: !ls.total || ls.read >= Math.ceil(ls.total * READ_RATE),
      progress: ls.total ? ls.read / ls.total : 1,
      text: ls.total ? `読んだ回 ${ls.read} / ${ls.total}` : '教科書はありません',
      act: nl ? { kind: 'lesson', id: nl.id, label: ls.read ? '続きを読む' : '第1回を読む' } : { kind: 'tab', tab: 'book', label: '教科書をひらく' },
    },
    {
      id: 'try', title: 'すべての分野の問題を解く',
      done: triedAll,
      progress: cats.length ? cats.reduce((a, x) => a + Math.min(1, x.tried / TRY_RATE), 0) / cats.length : 1,
      text: `どの分野も${Math.round(TRY_RATE * 100)}%以上に挑戦（いま ${Math.round(st.coverage * 100)}%${lowTry && lowTry.tried < TRY_RATE ? `・いちばん少ないのは「${lowTry.name}」` : ''}）`,
      act: lowTry && lowTry.tried < TRY_RATE ? { kind: 'cat', cat: lowTry.id, label: `「${short(lowTry.name)}」を解く` } : { kind: 'q', mode: 'smart', label: 'おまかせで解く' },
    },
    {
      id: 'fix', title: '苦手な分野をなくす',
      done: strongAll,
      progress: cats.length ? cats.filter(strong).length / cats.length : 1,
      text: `最後に解いた結果で${Math.round(target * 100)}%以上の分野 ${cats.filter(strong).length} / ${cats.length}${weak.length ? `（いちばん低いのは「${weak[0].name}」${Math.round(weak[0].rate * 100)}%）` : ''}`,
      act: st.wrong ? { kind: 'q', mode: 'wrong', label: `間違えた ${st.wrong}問を解き直す` } : weak.length ? { kind: 'cat', cat: weak[0].id, label: `「${short(weak[0].name)}」を解く` } : { kind: 'q', mode: 'smart', label: 'おまかせで解く' },
    },
    {
      id: 'mock', title: '模擬試験で2回続けて合格圏',
      done: st.ready,
      progress: Math.min(1, (st.mockStreak || 0) / 2),
      text: `本番と同じ形式で${Math.round(target * 100)}%以上（合格ライン＋余裕）を2回続けて（いま ${st.mockStreak || 0}回${mocks.length ? `・前回 ${Math.round((mocks[0].correct / mocks[0].total) * 100)}%` : ''}）`,
      act: { kind: 'q', mode: 'mock', label: mocks.length ? 'もう一度、模擬試験' : '模擬試験を受ける' },
    },
    {
      id: 'apply', title: '受験を申し込む',
      done: st.status === 'booked' || st.status === 'passed',
      progress: st.status === 'booked' || st.status === 'passed' ? 1 : 0,
      text: st.status === 'passed' ? '合格しました' : st.status === 'booked' ? `受験日 ${st.exam.date}` : '申込みの手順はガイドにあります。受験日を「受験」タブに入れておきましょう',
      act: { kind: 'tab', tab: 'exam', label: '受験日を入れる・申込みの手順' },
    },
  ]
  // 今やる段：終わっていない最初の段
  let cur = steps.findIndex((x) => !x.done)
  if (cur === -1) cur = steps.length - 1
  // 模擬試験で目安に届いたら、残りの段があっても申込みを先に案内する
  if (st.ready && !steps[4].done) cur = 4
  return { steps, cur, done: steps.filter((x) => x.done).length, target, cats }
}

const short = (name) => String(name).replace(/^第\d+章\s*/, '').slice(0, 14)
